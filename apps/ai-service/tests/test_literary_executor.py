import asyncio
import json
import shutil
import socket
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from copy import deepcopy
from pathlib import Path
from uuid import uuid4

import httpx
import pytest

from app.core.config import Settings
from app.evaluation import literary_executor as ex
from app.narrative.prompts import MASTER, NARRATOR
from app.narrative.schemas import TurnRequest
from app.narrative.selection import planner_request

ROOT = Path(__file__).resolve().parents[3]


@pytest.fixture(autouse=True)
def block_network(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError("External network forbidden in C.1 tests")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket.socket, "connect_ex", blocked)
    monkeypatch.setattr(socket, "create_connection", blocked)


def settings(**kwargs):
    return Settings(
        _env_file=None,
        llm_provider="gemini",
        gemini_model=ex.MODEL,
        ai_free_tier_confirmed=True,
        gemini_api_key="synthetic-private-test-credential",
        **kwargs,
    )


class Script:
    def __init__(
        self,
        mutations=None,
        *,
        status=200,
        version=ex.MODEL,
        usage=True,
        directory=None,
    ):
        self.plan = ex.verify(ROOT)
        self.by_id = {c["proposeRequest"]["actionId"]: c for c in self.plan["cases"]}
        self.calls = []
        self.mutations = mutations or {}
        self.status, self.version, self.usage = status, version, usage
        self.directory = directory

    def __call__(self, request):
        body = json.loads(request.content)
        prompt = body["contents"][0]["parts"][0]["text"]
        data = json.loads(prompt.removeprefix("DADOS:\n"))
        case = self.by_id[data["actionId"]]
        stage = data["stage"]
        if self.directory:
            events = [
                json.loads(line)
                for line in (self.directory / "events.jsonl").read_text().splitlines()
            ]
            assert events[-1]["type"] == "reserved"
            assert events[-1]["data"]["caseId"] == case["caseId"]
            assert events[-1]["data"]["stage"] == stage
        self.calls.append((case["caseId"], stage, body))
        if self.status != 200:
            return httpx.Response(
                self.status,
                json={
                    "error": {
                        "code": self.status,
                        "message": "Billing uncertainty"
                        if self.status == 402
                        else "Provider rejected request",
                        "status": "RESOURCE_EXHAUSTED",
                    }
                },
                headers={"Authorization": "MUST_NOT_BE_RECORDED"},
            )
        if stage == "PROPOSE":
            payload = deepcopy(case["expectedProposal"])
        else:
            beat = deepcopy(case["authorizedPreparedBeats"][0])
            payload = {"narrative": beat["text"], "eventIds": [], "beats": [beat]}
        change = self.mutations.get((case["caseId"], stage))
        if change:
            payload = change(payload)
        raw = (
            payload
            if isinstance(payload, str)
            else json.dumps(payload, ensure_ascii=False, indent=3)
        )
        response = {
            "candidates": [
                {
                    "content": {"role": "model", "parts": [{"text": raw}]},
                    "finishReason": "STOP",
                }
            ]
        }
        if self.version is not None:
            response["modelVersion"] = self.version
        if self.usage:
            response["usageMetadata"] = {
                "promptTokenCount": 31,
                "candidatesTokenCount": 12,
                "totalTokenCount": 43,
            }
        return httpx.Response(200, json=response)


def execute(tmp_path, script, *, independent=False, round_id=None, directory=None):
    directory = directory or tmp_path / "receipts"
    return asyncio.run(
        ex.run_round(
            ROOT,
            directory,
            round_id or str(uuid4()),
            settings=settings(),
            approval={"continueIndependent": independent},
            offline=True,
            transport=script,
            ledger=tmp_path / "ledger",
        )
    )


def test_c1_001_all_six_cases_use_reserved_global_budget_before_http(tmp_path):
    script = Script(directory=tmp_path / "receipts")
    result = execute(tmp_path, script)
    assert result["status"] == "COMPLETED_REVIEW_PENDING"
    assert result["realProviderRequests"] == 0
    assert len(script.calls) == 12
    assert result["budget"] == {
        "reservedRequests": 12,
        "proposeReserved": 6,
        "narrateReserved": 6,
        "configuredOutputCeilingReserved": 11400,
        "retiredNarrateCases": [],
    }
    assert [c[0] for c in script.calls] == [
        f"C1-{i}" for i in range(1, 7) for _ in range(2)
    ]
    assert all(
        row["inputTokens"] == 31
        and row["outputTokens"] == 12
        and row["totalTokens"] == 43
        for row in result["attempts"]
    )
    assert (
        json.loads((tmp_path / "receipts/human-review.json").read_text())[
            "humanApproved"
        ]
        is False
    )


def test_c1_001_concurrent_reservations_limits_and_retirement_are_irreversible():
    budget = ex.Budget(maximum=2)

    def reserve(i):
        try:
            return budget.reserve(f"C1-{i}", "PROPOSE", 65000, 700)
        except ex.Halt:
            return None

    with ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(reserve, range(1, 7)))
    assert sum(r is not None for r in results) == 2
    assert len(budget.used) == 2
    fresh = ex.Budget()
    for chars, tokens in [(65001, 700), (10, 701)]:
        with pytest.raises(ex.Halt, match="REQUEST_LIMIT"):
            fresh.reserve("C1-1", "PROPOSE", chars, tokens)
    assert not fresh.used
    fresh.reserve("C1-1", "PROPOSE", 10, 700)
    fresh.retire_narrate("C1-1")
    with pytest.raises(ex.Halt, match="RETIRED"):
        fresh.reserve("C1-1", "NARRATE", 10, 1200)
    with pytest.raises(ex.Halt, match="ALREADY_USED"):
        fresh.reserve("C1-1", "PROPOSE", 10, 700)


def test_c1_002_wrong_propose_is_a_failure_even_when_backend_blocks_it(tmp_path):
    def wrong(p):
        p["tool"] = {"type": "DIALOGUE", "topic": "not-prepared", "act": "ANSWER"}
        return p

    script = Script({("C1-1", "PROPOSE"): wrong})
    result = execute(tmp_path, script, independent=True)
    first = result["attempts"][0]
    assert first["selection"]["categoricalSelectionPassed"] is False
    assert first["nest"]["backendBlocked"] is True
    assert first["nest"]["resolution"]["category"] == "CLARIFY"
    assert ("C1-1", "NARRATE") not in [(a, b) for a, b, _ in script.calls]
    assert result["budget"]["reservedRequests"] == 11
    assert result["budget"]["retiredNarrateCases"] == ["C1-1"]


@pytest.mark.parametrize(
    "raw",
    [
        "{",
        '{"kind":"QUERY"}',
        '{"kind":"FREE","tool":{"type":"DIALOGUE","state":"CHANGED"}}',
    ],
)
def test_c1_003_bad_schema_is_preserved_not_normalized_to_a_pass(tmp_path, raw):
    script = Script({("C1-1", "PROPOSE"): lambda _: raw})
    result = execute(tmp_path, script)
    row = result["attempts"][0]
    assert row["rawText"] == raw
    assert row["structuredOriginal"] is None
    assert row["parsing"]["pydantic"] is False
    assert row["nest"]["zod"]["valid"] is False
    assert row["graphResponse"]["proposal"]["tool"]["type"] == "CLARIFY"
    assert row["selection"]["categoricalSelectionPassed"] is False
    assert result["status"] == "INTERRUPTED" and len(script.calls) == 1


@pytest.mark.parametrize(
    "version,reason",
    [("another-model", "UNEXPECTED_MODEL"), (None, "MODEL_IDENTITY_UNVERIFIED")],
)
def test_c1_004_unexpected_or_unverifiable_reported_model_stops(
    tmp_path, version, reason
):
    script = Script(version=version)
    result = execute(tmp_path, script)
    assert result["stopReason"] == reason
    assert len(script.calls) == 1
    assert result["attempts"][0]["reportedModel"] == version


@pytest.mark.parametrize(
    "status,reason",
    [
        (429, "RATE_LIMIT"),
        (401, "AUTHENTICATION"),
        (403, "AUTHENTICATION"),
        (402, "BILLING_OR_FINANCIAL_UNCERTAINTY"),
    ],
)
def test_c1_005_provider_errors_stop_without_retry_or_fallback(
    tmp_path, status, reason
):
    script = Script(status=status)
    result = execute(tmp_path, script)
    assert result["stopReason"] == reason
    assert len(script.calls) == 1
    row = result["attempts"][0]
    assert row["inputTokens"] is row["outputTokens"] is row["totalTokens"] is None
    assert row["reportedModel"] is None
    assert "MUST_NOT_BE_RECORDED" not in json.dumps(result)


@pytest.mark.parametrize(
    "missing",
    [
        "authorized",
        "freeProject",
        "billingDisabled",
        "keyFingerprint",
        "projectLabel",
        "manifestDigest",
    ],
)
def test_c1_006_live_gate_blocks_before_sdk_and_keeps_normal_settings(missing):
    normal = settings().model_copy(update={"ai_free_tier_confirmed": False})
    approval = {
        "authorized": True,
        "freeProject": True,
        "billingDisabled": True,
        "projectLabel": "synthetic-free-project",
        "manifestDigest": "reviewed-hash",
        "keyFingerprint": ex.sha(normal.gemini_api_key.get_secret_value().encode()),
    }
    approval[missing] = None
    with pytest.raises(ex.Halt):
        ex.authorize(normal, approval, manifest_digest="reviewed-hash")
    assert normal.ai_free_tier_confirmed is False


def test_c1_006_confirmation_is_process_local_and_key_bound():
    normal = settings().model_copy(update={"ai_free_tier_confirmed": False})
    approval = {
        "authorized": True,
        "freeProject": True,
        "billingDisabled": True,
        "projectLabel": "synthetic-free-project",
        "manifestDigest": "hash",
        "keyFingerprint": ex.sha(normal.gemini_api_key.get_secret_value().encode()),
    }
    active = ex.authorize(normal, approval, manifest_digest="hash")
    assert active.ai_free_tier_confirmed and not normal.ai_free_tier_confirmed
    approval["keyFingerprint"] = "wrong-key"
    with pytest.raises(ex.Halt, match="KEY_PROJECT"):
        ex.authorize(normal, approval, manifest_digest="hash")
    approval["keyFingerprint"] = ex.sha(
        normal.gemini_api_key.get_secret_value().encode()
    )
    for modified in [
        normal.model_copy(update={"enable_provider_fallback": True}),
        normal.model_copy(update={"gemini_model": "another-model"}),
    ]:
        with pytest.raises(ex.Halt):
            ex.authorize(modified, approval, manifest_digest="hash")


def test_c1_007_raw_json_and_graph_assembly_remain_separate(tmp_path):
    def redundant(p):
        p["narrative"] = "Uma string redundante que diverge dos beats."
        return p

    result = execute(tmp_path, Script({("C1-1", "NARRATE"): redundant}, usage=False))
    row = result["attempts"][1]
    original = json.loads(row["rawText"])
    assert original["narrative"] == "Uma string redundante que diverge dos beats."
    assert row["structuredOriginal"]["narrative"] == original["narrative"]
    assert row["graphResponse"]["narration"]["narrative"] != original["narrative"]
    assert row["nest"]["originalValidation"]["accepted"] is False
    assert row["nest"]["publication"]["accepted"] is True
    assert row["selection"]["categoricalSelectionPassed"] is False
    assert row["inputTokens"] is row["outputTokens"] is row["totalTokens"] is None


def test_c1_008_only_production_request_and_prompt_reach_sdk(tmp_path):
    script = Script()
    execute(tmp_path, script)
    for case_id, stage, body in script.calls:
        text = body["contents"][0]["parts"][0]["text"]
        for forbidden in [
            "expectedProposal",
            "acceptableSemanticSelections",
            "authorizedPreparedBeats",
            "humanReviewRequired",
            "rubric",
        ]:
            assert forbidden not in text
        entry = next(c for c in script.plan["cases"] if c["caseId"] == case_id)
        request = TurnRequest.model_validate(
            entry["proposeRequest" if stage == "PROPOSE" else "narrateRequest"]
        )
        expected = planner_request(request) if stage == "PROPOSE" else request
        assert text == "DADOS:\n" + expected.model_dump_json()
        assert body["systemInstruction"]["parts"][0]["text"] == (
            MASTER if stage == "PROPOSE" else NARRATOR
        )
        assert body["generationConfig"]["maxOutputTokens"] == (
            700 if stage == "PROPOSE" else 1200
        )


def test_c1_009_016_material_addition_is_rejected_and_not_counted(tmp_path):
    def gallery(p):
        p["beats"].append(
            {
                "kind": "ATMOSPHERE",
                "speakerId": None,
                "factIds": [],
                "text": "Atrás da estante há uma galeria que conduz ao jardim.",
            }
        )
        p["narrative"] = "\n\n".join(b["text"] for b in p["beats"])
        return p

    result = execute(tmp_path, Script({("C1-1", "NARRATE"): gallery}))
    row = result["attempts"][1]
    assert row["nest"]["publication"]["accepted"] is False
    assert row["nest"]["publication"]["reason"] == "UNAPPROVED_SEGMENT"
    assert row["fallbackUsed"] is True
    assert "galeria" in row["rawText"]
    assert "galeria" not in json.dumps(result["publishedMetrics"], ensure_ascii=False)
    fallback = row["nest"]["publication"]["narration"]["narrative"]
    assert result["publishedMetrics"]["publishedFragments"]["distribution"] == {
        fallback: 1
    }


def test_c1_010_011_012_identity_own_memory_and_no_effects(tmp_path, monkeypatch):
    monkeypatch.setenv(
        "DATABASE_URL", "postgresql://forbidden-real-database/must-not-connect"
    )
    plan_before = (ROOT / ex.PLAN).read_bytes()
    result = execute(tmp_path, Script())
    narrated = [r for r in result["attempts"] if r["stage"] == "NARRATE"]
    assert len({r["nest"]["speakerId"] for r in narrated}) == 3
    for row in narrated:
        nest = row["nest"]
        spoken = [
            b
            for b in nest["publication"]["narration"]["beats"]
            if b["kind"] == "DIALOGUE"
        ]
        assert all(b["speakerId"] == nest["speakerId"] for b in spoken)
        assert all(
            set(b["factIds"]) <= {f["eventId"] for f in nest["facts"]} for b in spoken
        )
        if row["caseId"] in ["C1-4", "C1-5"]:
            assert all(f["source"] == "HEARD" for f in nest["facts"])
            assert (
                "A protagonista disse:" in nest["publication"]["narration"]["narrative"]
            )
        assert nest["campaignWrites"] is False
    assert plan_before == (ROOT / ex.PLAN).read_bytes()
    assert all(not r["nest"].get("wouldAuthorizeEffect") for r in result["attempts"])


@pytest.mark.parametrize("field", ["speakerId", "factIds"])
def test_c1_010_011_foreign_speaker_or_memory_never_crosses_publication(
    tmp_path, field
):
    def foreign(p):
        p["beats"][0][field] = str(uuid4()) if field == "speakerId" else [str(uuid4())]
        return p

    result = execute(tmp_path, Script({("C1-1", "NARRATE"): foreign}))
    assert result["attempts"][1]["nest"]["publication"]["reason"] in [
        "SPEAKER",
        "UNOWNED_KNOWLEDGE",
    ]
    assert result["attempts"][1]["fallbackUsed"]


def test_c1_012_mechanical_request_in_frozen_speak_context_is_blocked(tmp_path):
    def magic(p):
        p.update(
            intent="ARCANA",
            expression="DIRECT",
            target=None,
            tool={"type": "ARCANA", "arcanum": "psychic-shield", "raised": True},
        )
        return p

    script = Script({("C1-1", "PROPOSE"): magic})
    result = execute(tmp_path, script, independent=True)
    assert result["attempts"][0]["nest"]["wouldAuthorizeEffect"] is False
    assert result["attempts"][0]["nest"]["backendBlocked"] is True
    assert result["attempts"][0]["selection"]["categoricalSelectionPassed"] is False
    assert ("C1-1", "NARRATE") not in [(a, b) for a, b, _ in script.calls]


def test_c1_012_unexpected_effect_signal_interrupts_without_an_executor(
    tmp_path, monkeypatch
):
    original = ex.replay

    def signal(root, case, stage, raw, graph):
        result = original(root, case, stage, raw, graph)
        # Deliberately simulate an unexpected read-only replay risk report. Do
        # not change the frozen SPEAK input to manufacture a mechanical success.
        if raw and "\n" in raw:
            result["wouldAuthorizeEffect"] = True
        return result

    monkeypatch.setattr(ex, "replay", signal)
    script = Script()
    result = execute(tmp_path, script, independent=True)
    assert result["stopReason"] == "RISK_OF_REAL_EFFECTS"
    assert len(script.calls) == 1


@pytest.mark.parametrize(
    "relative",
    [
        ex.PLAN,
        "docs/ai/phase-5.6.3c-0-catalog-results.json",
        "apps/ai-service/app/narrative/prompts.py",
    ],
)
def test_c1_013_hash_drift_prevents_all_requests(tmp_path, relative):
    manifest = json.loads((ROOT / ex.MANIFEST).read_text())
    plan = json.loads((ROOT / ex.PLAN).read_text())
    paths = (
        set(manifest["files"])
        | set(plan["productionAndFixtureHashes"])
        | {ex.PLAN, ex.MANIFEST, "docs/ai/phase-5.6.3c-0-catalog-results.json"}
    )
    root = tmp_path / "copy"
    for p in paths:
        target = root / p
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / p, target)
    assert ex.verify(root)
    p = root / relative
    p.write_bytes(p.read_bytes() + b" ")
    with pytest.raises(ex.Halt, match="DRIFT"):
        ex.verify(root)
    script = Script()
    with pytest.raises(ex.Halt):
        asyncio.run(
            ex.run_round(
                root,
                tmp_path / "new",
                str(uuid4()),
                settings=settings(),
                approval={},
                offline=True,
                transport=script,
            )
        )
    assert not script.calls


def test_c1_014_existing_receipt_or_round_cannot_be_reused(tmp_path):
    directory, ledger = tmp_path / "round", tmp_path / "ledger"
    identity = str(uuid4())
    journal = ex.Journal(directory, ledger, identity)
    journal.append("started", {"immutable": "original"})
    journal.file.close()
    before = (directory / "events.jsonl").read_bytes()
    with pytest.raises(ex.Halt, match="RECEIPT_ALREADY_EXISTS"):
        ex.Journal(directory, ledger, str(uuid4()))
    with pytest.raises(ex.Halt, match="ROUND_ALREADY_CLAIMED"):
        ex.Journal(tmp_path / "another", ledger, identity)
    assert (directory / "events.jsonl").read_bytes() == before


def test_c1_015_generic_authorized_text_is_not_a_literary_or_contextual_pass(tmp_path):
    plan = ex.verify(ROOT)
    generic = next(
        b
        for b in plan["cases"][0]["narrateRequest"]["context"]["rendering"][
            "publication"
        ]["choices"]
        if b["kind"] == "DIALOGUE"
    )

    def choose(_):
        return {"narrative": generic["text"], "eventIds": [], "beats": [generic]}

    result = execute(tmp_path, Script({("C1-1", "NARRATE"): choose}))
    row = result["attempts"][1]
    assert row["nest"]["publication"]["accepted"] is True
    assert row["selection"]["genericDespitePreparedContent"] is True
    assert row["selection"]["categoricalSelectionPassed"] is False
    assert row["selection"]["semanticPertinence"] is None
    assert (
        json.loads((tmp_path / "receipts/human-review.json").read_text())[
            "automaticLiteraryScores"
        ]
        is None
    )


def test_private_response_is_withheld_without_leaking_credentials(tmp_path):
    secret = settings().gemini_api_key.get_secret_value()

    def leak(p):
        p["description"] = secret
        return p

    result = execute(tmp_path, Script({("C1-1", "PROPOSE"): leak}))
    assert result["stopReason"] == "PRIVATE_MATERIAL"
    assert result["attempts"][0]["rawText"] is None
    assert result["attempts"][0]["rawTextSha256"]
    assert secret not in json.dumps(result)
    assert secret not in (tmp_path / "receipts/events.jsonl").read_text()


def test_live_execution_without_new_approval_never_constructs_sdk(
    tmp_path, monkeypatch
):
    from google import genai

    def forbidden(**kwargs):
        raise AssertionError("Live client must not be constructed")

    monkeypatch.setattr(genai, "Client", forbidden)
    normal = settings().model_copy(update={"ai_free_tier_confirmed": False})
    with pytest.raises(ex.Halt, match="AUTHORIZATION_REQUIRED"):
        asyncio.run(
            ex.run_round(
                ROOT,
                tmp_path / "live",
                str(uuid4()),
                settings=normal,
                approval={},
                offline=False,
            )
        )
    assert not (tmp_path / "live").exists()
    assert not normal.ai_free_tier_confirmed


def test_raw_capture_survives_a_later_local_replay_failure(tmp_path, monkeypatch):
    original = ex.replay

    def fail_after_raw(root, case, stage, raw, graph):
        if raw and "\n" in raw:
            raise ex.Halt("NESTJS_REPLAY_UNVERIFIABLE")
        return original(root, case, stage, raw, graph)

    monkeypatch.setattr(ex, "replay", fail_after_raw)
    script = Script()
    result = execute(tmp_path, script)
    assert result["stopReason"] == "NESTJS_REPLAY_UNVERIFIABLE"
    assert len(script.calls) == 1
    assert result["attempts"][0]["rawText"]
    events = [
        json.loads(line)
        for line in (tmp_path / "receipts/events.jsonl").read_text().splitlines()
    ]
    assert any(e["type"] == "raw-response" and e["data"]["rawText"] for e in events)


def test_dry_run_installs_its_own_network_block(tmp_path):
    from app.providers.errors import ProviderError

    script = Script()

    def transport(request):
        with pytest.raises(ProviderError, match="EXTERNAL_NETWORK_FORBIDDEN"):
            socket.create_connection(("127.0.0.1", 9))
        return script(request)

    result = execute(tmp_path, transport)
    assert result["status"] == "COMPLETED_REVIEW_PENDING"


def test_preflight_cli_and_missing_live_round_do_not_enable_provider(
    monkeypatch, capsys, tmp_path
):
    normal = settings().model_copy(update={"ai_free_tier_confirmed": False})
    monkeypatch.setattr(ex, "Settings", lambda: normal)
    monkeypatch.setattr("sys.argv", ["literary_executor"])
    ex.main()
    report = json.loads(capsys.readouterr().out)
    assert report["status"] == "PREFLIGHT_ONLY_NO_REQUESTS"
    assert normal.gemini_api_key.get_secret_value() not in json.dumps(report)
    monkeypatch.setattr(
        "sys.argv",
        [
            "literary_executor",
            "--authorize-live",
            "--output-dir",
            str(tmp_path / "live"),
        ],
    )
    with pytest.raises(SystemExit):
        ex.main()
    assert not (tmp_path / "live").exists()


def test_partial_reported_usage_preserves_known_zero_and_unknown_counts(tmp_path):
    def wrong(p):
        p["tool"]["topic"] = "not-authorized"
        return p

    script = Script({("C1-1", "PROPOSE"): wrong})

    def transport(request):
        response = script(request)
        body = json.loads(response.content)
        body["usageMetadata"] = {"promptTokenCount": 0}
        return httpx.Response(200, json=body)

    result = execute(tmp_path, transport)
    row = result["attempts"][0]
    assert row["inputTokens"] == 0
    assert row["outputTokens"] is row["totalTokens"] is None
    assert row["usageReported"] is False
    assert len(result["caseOutcomes"]) == 6
    assert result["caseOutcomes"][1]["status"] == "NOT_ATTEMPTED_AFTER_STOP"


def test_public_dry_run_cli_uses_no_active_credentials_and_refuses_reuse(tmp_path):
    output = tmp_path / "cli"
    command = [
        sys.executable,
        "-m",
        "app.evaluation.literary_executor",
        "--dry-run",
        "--output-dir",
        str(output),
    ]
    first = subprocess.run(
        command,
        cwd=ROOT / "apps/ai-service",
        text=True,
        capture_output=True,
        timeout=45,
    )
    assert first.returncode == 0, first.stdout
    status = json.loads(first.stdout)
    assert status["reserved"] == 12 and status["realProviderRequests"] == 0
    before = (output / "result.json").read_bytes()
    second = subprocess.run(
        command,
        cwd=ROOT / "apps/ai-service",
        text=True,
        capture_output=True,
        timeout=45,
    )
    assert second.returncode == 1
    assert (output / "result.json").read_bytes() == before
    receipt = json.loads(before)
    assert receipt["authorization"]["source"] == "SYNTHETIC_TEST_ONLY"
    assert all(a["inputTokens"] is None for a in receipt["attempts"])


def test_financial_signal_in_success_response_is_withheld_and_stops(tmp_path):
    def financial(p):
        p["description"] = "Billing account status is unverifiable."
        return p

    script = Script({("C1-1", "PROPOSE"): financial})
    result = execute(tmp_path, script, independent=True)
    assert result["stopReason"] == "BILLING_OR_FINANCIAL_UNCERTAINTY"
    assert len(script.calls) == 1
    assert result["attempts"][0]["rawText"] is None
    assert result["attempts"][0]["rawWithheldReason"] == "FINANCIAL_DETAILS"
    assert "account status" not in json.dumps(result)
