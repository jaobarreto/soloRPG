import asyncio
import json
from types import SimpleNamespace

import pytest
from pydantic import ValidationError

from app.core.config import Settings
from app.evaluation import phase561
from app.narrative.schemas import SelectedFreeAction
from app.providers.errors import ProviderError


def settings(**changes):
    return Settings(
        _env_file=None,
        gemini_api_key="synthetic-not-a-key",
        ai_free_tier_confirmed=True,
    ).model_copy(update=changes)


@pytest.mark.parametrize(
    "changes,authorized,key_confirmed,budget,code",
    [
        ({}, False, True, 8, "LIVE_AUTHORIZATION_REQUIRED"),
        ({}, True, False, 8, "ACTIVE_KEY_PROJECT_CONFIRMATION_REQUIRED"),
        ({"ai_free_tier_confirmed": False}, True, True, 8, "FREE_TIER_NOT_CONFIRMED"),
        ({"llm_provider": "groq"}, True, True, 8, "GEMINI_REQUIRED"),
        ({"gemini_model": "another-model"}, True, True, 8, "UNEXPECTED_MODEL"),
        (
            {"enable_provider_fallback": True},
            True,
            True,
            8,
            "FALLBACK_MUST_BE_DISABLED",
        ),
        ({}, True, True, 9, "REQUEST_BUDGET"),
    ],
)
def test_preflight_rejects_before_any_sdk_or_output(
    monkeypatch, tmp_path, changes, authorized, key_confirmed, budget, code
):
    def forbidden(*args, **kwargs):
        raise AssertionError("SDK/router must not be constructed")

    monkeypatch.setattr(phase561, "ProviderRouter", forbidden)
    output = tmp_path / "result.json"
    with pytest.raises(ProviderError, match=code):
        asyncio.run(
            phase561.evaluate(
                settings(**changes),
                output,
                authorized=authorized,
                key_confirmed=key_confirmed,
                max_requests=budget,
            )
        )
    assert not output.exists()


@pytest.mark.parametrize(
    "behavior,attempts",
    [
        ("valid", 8),
        ("schema", 2),
        ("429", 2),
        ("model", 2),
    ],
)
def test_real_graph_router_budget_stop_raw_capture_and_no_expectation_leak(
    monkeypatch, tmp_path, behavior, attempts
):
    cases = json.loads(phase561.PLAN.read_text())["cases"]
    calls = []

    class FakeGemini:
        def __init__(self, key, model, timeout):
            self.input_tokens = 0
            self.output_tokens = 0
            self.total_tokens = None
            self.usage_reported = False

            async def generate(**kwargs):
                case = cases[len(calls)]
                calls.append(kwargs)
                assert kwargs["max_output_tokens"] == 700
                assert kwargs["output_schema"].__name__ == "SelectedFreeAction"
                prompt = json.loads(kwargs["prompt"].removeprefix("DADOS:\n"))
                assert prompt["playerMessage"] == case["request"]["playerMessage"]
                assert "expected" not in prompt and "offlineProposal" not in prompt
                if len(calls) == 2 and behavior == "429":
                    raise ProviderError("RATE_LIMIT", transient=True)
                payload = case["offlineProposal"]
                if len(calls) == 2 and behavior == "schema":
                    payload = {"kind": "ADMIN", "tool": {"type": "RESOURCE_SET"}}
                version = (
                    "unexpected-model"
                    if behavior == "model" and len(calls) == 2
                    else phase561.MODEL
                )
                return SimpleNamespace(text=json.dumps(payload), model_version=version)

            self.client = SimpleNamespace(
                aio=SimpleNamespace(
                    models=SimpleNamespace(generate_content=generate),
                )
            )

        async def generate_structured(
            self, prompt, output_schema, *, max_output_tokens
        ):
            result = await self.client.aio.models.generate_content(
                prompt=prompt,
                output_schema=output_schema,
                max_output_tokens=max_output_tokens,
            )
            self.input_tokens, self.output_tokens = 20, 10
            self.total_tokens, self.usage_reported = 30, True
            try:
                return output_schema.model_validate_json(result.text)
            except ValidationError:
                raise ProviderError("INVALID_RESPONSE") from None

        async def close(self):
            pass

    monkeypatch.setattr(phase561, "GeminiProvider", FakeGemini)
    output = tmp_path / "result.json"
    report = asyncio.run(
        phase561.evaluate(
            settings(),
            output,
            authorized=True,
            key_confirmed=True,
        )
    )
    assert len(calls) == report["attempts"] == attempts
    assert report["frozenInputsPreserved"]
    assert report["rows"][0]["rawResponse"]
    if behavior == "schema":
        assert report["stopReason"] == "INVALID_RESPONSE"
        assert report["rows"][-1]["schemaValid"] is False
        assert "semantic" not in report["rows"][-1]
    if behavior == "429":
        assert report["stopReason"] == "RATE_LIMIT"
        assert report["rows"][-1]["usage"][0]["inputTokens"] is None
    if behavior == "model":
        assert report["stopReason"] == "UNEXPECTED_MODEL"
    with pytest.raises(FileExistsError):
        asyncio.run(
            phase561.evaluate(
                settings(),
                output,
                authorized=True,
                key_confirmed=True,
            )
        )
    assert len(calls) == attempts


def test_captured_real_response_has_correct_selection_but_invalid_envelope():
    receipt = json.loads(
        (phase561.ROOT / "docs/ai/phase-5.6.1-live-result.json").read_text()
    )
    row = receipt["rows"][0]
    raw = json.loads(row["rawResponse"])
    case = json.loads(phase561.PLAN.read_text())["cases"][0]
    assert phase561.grade(case, raw)["passed"]
    with pytest.raises(ValidationError) as exc:
        SelectedFreeAction.model_validate(raw)
    assert [(e["loc"], e["type"]) for e in exc.value.errors()] == [
        (("kind",), "literal_error")
    ]
    result = phase561.replay(phase561.TurnRequest.model_validate(case["request"]), raw)
    assert result == {"schemaValid": False, "authorization": "NOT_EVALUABLE"}


@pytest.mark.parametrize("semantic_mismatch", [False, True])
def test_selected_cases_use_only_original_investigation_contexts(
    monkeypatch, tmp_path, semantic_mismatch
):
    index = {c["id"]: c for c in json.loads(phase561.PLAN.read_text())["cases"]}
    selected = [index["561-03"], index["561-04"]]
    seen = []

    class ScriptedRouter:
        def __init__(self, settings, max_requests):
            assert max_requests == 1
            self.usage = []
            self.validation_issues = []

        async def generate_structured(self, prompt, schema, **kwargs):
            case = selected[len(seen)]
            data = json.loads(prompt.removeprefix("DADOS:\n"))
            seen.append(data)
            assert data["playerMessage"] == case["request"]["playerMessage"]
            assert kwargs["max_output_tokens"] == 700
            assert bool(data["context"]["checks"]) == (case["id"] == "561-03")
            proposal = case["offlineProposal"]
            if semantic_mismatch and case["id"] == "561-03":
                proposal = {
                    **proposal,
                    "tool": {"type": "QUERY", "subject": "LOCATION"},
                }
            return schema.model_validate(proposal)

    monkeypatch.setattr(phase561, "ProviderRouter", ScriptedRouter)
    report = asyncio.run(
        phase561.evaluate(
            settings(),
            tmp_path / "selected.json",
            authorized=True,
            key_confirmed=True,
            max_requests=2,
            case_ids=["561-03", "561-04"],
        )
    )
    assert [r["id"] for r in report["rows"]] == ["561-03", "561-04"]
    assert report["selectedCaseIds"] == ["561-03", "561-04"]
    assert len(seen) == report["attempts"] == 2
    for row, case in zip(report["rows"], selected, strict=True):
        assert row["request"] == case["request"]
        assert row["expected"] == case["expected"]
        assert row["semantic"]["passed"] == (
            not semantic_mismatch or case["id"] == "561-04"
        )
    if semantic_mismatch:
        assert report["rows"][0]["nestJS"]["resolution"]["category"] == "CLARIFY"
        assert report.get("stopReason") is None


@pytest.mark.parametrize(
    "ids", [[], ["561-03", "561-03"], ["unknown"], ["561-03", "561-04", "561-05"]]
)
def test_case_selection_rejected_before_any_router_or_receipt(
    monkeypatch, tmp_path, ids
):
    def forbidden(*args, **kwargs):
        raise AssertionError("No router before case selection validation")

    monkeypatch.setattr(phase561, "ProviderRouter", forbidden)
    output = tmp_path / "invalid-selection.json"
    with pytest.raises(ProviderError, match="CASE_SELECTION"):
        asyncio.run(
            phase561.evaluate(
                settings(),
                output,
                authorized=True,
                key_confirmed=True,
                max_requests=2,
                case_ids=ids,
            )
        )
    assert not output.exists()
