import asyncio
import json
import socket
from copy import deepcopy
from pathlib import Path

import pytest

from app.evaluation.literary_preparation import (
    analyze,
    body,
    build_plan,
    history_comparison,
    main,
    measure,
    published_beats,
    quote_depth,
    voice_pair,
)
from app.evaluation.replay import ScriptedProvider
from app.narrative.graph import run_turn
from app.narrative.schemas import TurnRequest

ROOT = Path(__file__).resolve().parents[3]
CATALOG = ROOT / "docs/ai/phase-5.6.3c-0-catalog-results.json"


@pytest.fixture(autouse=True)
def no_external_network(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError("External calls forbidden in literary preparation")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket.socket, "connect_ex", blocked)


def catalog():
    return json.loads(CATALOG.read_text())


def test_exact_metrics_distinguish_text_fragments_sources_and_proxies():
    beat = {
        "kind": "DIALOGUE",
        "speakerId": "npc",
        "text": "Iria — Eu ouvi:\n> Uma fala.",
        "factIds": ["own"],
    }
    turns = [
        {
            "id": str(i),
            "publicText": beat["text"],
            "publishedBeats": [beat],
            "preparedReplies": [{"beat": beat}],
            "authorizedFacts": [{"eventId": "own"}],
        }
        for i in range(3)
    ]
    result = measure({"scenarioId": "unit", "selector": "script", "turns": turns})
    assert result["identicalAdjacentReplies"] == 2
    assert result["publishedFragments"]["repeatedBeyondFirst"] == 2
    assert result["identicalFragmentsAcrossAdjacentTurns"] == 2
    assert result["eligiblePreparedCounts"] == [1, 1, 1]
    assert result["genericInsteadOfPrepared"] == 0
    assert result["referencedTurnsCheckedAgainstOwnProjection"] == 3
    assert result["allSelectedReferencesInOwnProjection"] is True
    assert result["humanLiteraryScores"] is None
    assert result["semanticSourceRelevance"] is None


def test_rejected_draft_is_not_counted_as_published_or_an_approved_model_choice():
    result = {
        "kind": "RESULT",
        "text": "A busca não identificou nenhuma abertura.",
        "factIds": [],
        "speakerId": None,
    }
    bad = {**result, "kind": "ATMOSPHERE", "text": "Galeria inventada."}
    turn = {
        "id": "failed",
        "publicText": result["text"],
        "trace": [{"stage": "NARRATE", "catalog": [result], "selected": [result, bad]}],
        "metadata": {
            "deterministicFallback": True,
            "renderingValidation": "UNAPPROVED_SEGMENT",
        },
    }
    assert published_beats(turn) == [result]
    metrics = measure({"scenarioId": "unit", "selector": "attack", "turns": [turn]})
    assert bad["text"] not in metrics["publishedFragments"]["distribution"]
    assert metrics["publicationRejections"] == {"UNAPPROVED_SEGMENT": 1}
    assert metrics["publishedFallbacks"] == 1
    assert metrics["allSelectedReferencesInOwnProjection"] is None
    assert metrics["noContentClassificationAvailable"] is False
    turn["publicText"] = "Sem registro suficiente para reconstruir beats."
    assert published_beats(turn) is None


def test_nested_quotes_and_voice_distance_do_not_become_quality_grades():
    assert quote_depth("Iria — Ouvi:\n> > > > Relato\n> Outra linha") == 4
    assert quote_depth("Uma seta > não é citação.") == 0
    assert body("Iria — Tessa falou de Iria.") == "Tessa falou de Iria."
    pair = voice_pair("Iria — Pode explicar?", "Tessa — Pode explicar?")
    assert pair["sameAfterRemovingDisplayName"] is True
    assert pair["tokenJaccardProxy"] == 1
    assert pair["perceptiblePersonalityScore"] is None
    assert voice_pair("", "")["tokenJaccardProxy"] is None


def test_generic_selection_content_gap_and_publication_rejection_are_distinct():
    data = catalog()
    run = next(r for r in data["runs"] if r["scenarioId"] == "NAR-11")
    metrics = measure(run)
    assert metrics["noContentClarifications"] == 2
    assert metrics["publicationRejections"] == {}
    assert metrics["publishedFallbacks"] == 0
    turn = deepcopy(data["runs"][0]["turns"][0])
    generic = next(b for b in turn["catalog"] if b["kind"] == "DIALOGUE")
    turn.update(publicText=generic["text"], publishedBeats=[generic])
    wrong = measure({"scenarioId": "control", "selector": "generic", "turns": [turn]})
    assert wrong["genericInsteadOfPrepared"] == 1
    assert wrong["publicationRejections"] == {}


def test_history_comparison_rejects_changed_inputs_or_unlabelled_origins():
    before = json.loads((ROOT / "docs/ai/phase-5.6.3a-lab-result.json").read_text())
    after = json.loads((ROOT / "docs/ai/phase-5.6.3b-lab-result.json").read_text())
    comparison = history_comparison(before, after)
    assert sum(r["turns"] for r in comparison["before"]) == 58
    after["runs"][0]["turns"][0]["step"]["text"] = "Outra pergunta"
    with pytest.raises(ValueError, match="comparable"):
        history_comparison(before, after)
    before["evidenceKind"] = "REAL_GEMINI"
    with pytest.raises(ValueError, match="scripted"):
        history_comparison(before, after)


def test_complete_metrics_never_approve_gemini_or_fill_human_scores():
    data = catalog()
    result = analyze(ROOT, data)
    assert sum(r["turns"] for r in result["catalogRuns"]) == 100
    assert result["automaticLiteraryScores"] is None
    assert result["humanScores"] is None
    assert result["geminiLiteraryQualityApproved"] is False
    sustained = next(
        r
        for r in result["catalogRuns"]
        if r["scenarioId"] == "NAR-12" and r["selector"] == "ROTATE_PREPARED"
    )
    assert sustained["turns"] == 12
    assert sustained["fullReplies"]["distinct"] == 2
    assert sustained["identicalAdjacentReplies"] == 0
    assert sustained["publishedFragments"]["repeatedBeyondFirst"] == 31
    # Low adjacent repetition demonstrably coexists with only two repeated replies.
    assert sustained["humanLiteraryScores"] is None


@pytest.mark.parametrize(
    "mutation", ["missing", "duplicate", "live", "database", "kind", "turn", "message"]
)
def test_incomplete_or_real_origin_is_not_mixed_into_offline_diagnostics(mutation):
    data = catalog()
    if mutation == "missing":
        data["runs"].pop()
    elif mutation == "duplicate":
        data["runs"][0] = data["runs"][1]
    elif mutation == "live":
        data["realProviderRequests"] = 1
    elif mutation == "database":
        data["databaseUsed"] = True
    elif mutation == "turn":
        data["runs"][0]["turns"].pop()
    elif mutation == "message":
        data["runs"][0]["turns"][0]["playerMessage"] = "Pergunta facilitada"
    else:
        data["evidenceKind"] = "UNLABELLED_FIXTURE"
    with pytest.raises(ValueError):
        analyze(ROOT, data)


def test_recorded_eliminator_fails_even_when_text_is_fluent():
    data = catalog()
    data["runs"][0]["turns"][0]["canonicalFindings"] = ["PROTAGONIST_AGENCY"]
    result = analyze(ROOT, data)["catalogRuns"][0]
    assert result["canonicalGateFromRecordedFindings"]["eligible"] is False


def test_frozen_plan_budget_and_payloads_are_exercised_by_real_graph_offline():
    plan = build_plan(catalog())
    assert plan["status"] == "PREPARED_NOT_AUTHORIZED_NOT_EXECUTED"
    assert plan["maxRequests"] == 12
    assert plan["outputTokenLimits"]["aggregateConfiguredCeiling"] == 6 * (700 + 1200)
    assert plan["retries"] == 0 and plan["providerFallback"] is False
    assert (
        plan["cases"][0]["proposeRequest"]["playerMessage"]
        == plan["cases"][5]["proposeRequest"]["playerMessage"]
    )
    for case in plan["cases"]:
        for stage in ("PROPOSE", "NARRATE"):
            request = case["proposeRequest" if stage == "PROPOSE" else "narrateRequest"]
            assert "expectedProposal" not in json.dumps(request)
            assert "PRIVATE_" not in json.dumps(request)
            if stage == "PROPOSE":
                payload = case["expectedProposal"]
            else:
                beat = case["authorizedPreparedBeats"][0]
                payload = {"narrative": beat["text"], "eventIds": [], "beats": [beat]}

            class CapturingProvider(ScriptedProvider):
                limits = []

                async def generate_structured(
                    self, prompt, output_schema, *, max_output_tokens
                ):
                    self.limits.append(max_output_tokens)
                    assert "acceptableSemanticSelections" not in prompt
                    return await super().generate_structured(
                        prompt, output_schema, max_output_tokens=max_output_tokens
                    )

            provider = CapturingProvider(payload)
            response = asyncio.run(
                run_turn(TurnRequest.model_validate(request), provider)
            )
            assert provider.limits == [700 if stage == "PROPOSE" else 1200]
            assert (
                getattr(response, "proposal" if stage == "PROPOSE" else "narration")
                is not None
            )


def test_cli_is_offline_exclusive_and_preserves_existing_inputs(monkeypatch, tmp_path):
    before = CATALOG.read_bytes()
    output, plan = tmp_path / "metrics.json", tmp_path / "plan.json"
    monkeypatch.setattr(
        "sys.argv",
        [
            "literary_preparation",
            "--root",
            str(ROOT),
            "--catalog",
            str(CATALOG),
            "--output",
            str(output),
            "--plan-output",
            str(plan),
        ],
    )
    main()
    assert CATALOG.read_bytes() == before
    first = output.read_bytes()
    assert (
        json.loads(plan.read_text())["status"] == "PREPARED_NOT_AUTHORIZED_NOT_EXECUTED"
    )
    with pytest.raises(FileExistsError):
        main()
    assert output.read_bytes() == first
    monkeypatch.setattr("sys.argv", ["literary_preparation", "--authorize-live"])
    with pytest.raises(SystemExit):
        main()


def test_matrix_has_distinct_safety_states_and_all_multiturn_sequences():
    fixture = json.loads(
        (ROOT / "apps/api/test/fixtures/phase563c0-literary.json").read_text()
    )
    assert {s["id"] for s in fixture["scenarios"]} == {
        f"NAR-{i:02}" for i in range(1, 13)
    }
    assert all(len(s["turns"]) >= 2 for s in fixture["scenarios"])
    assert {s["sequence"] for s in fixture["scenarios"]} == {"A", "B", "C", "D"}
    search = fixture["scenarios"][9]["turns"]
    assert [t["informationState"] for t in search] == [
        "ABSENT",
        "UNSPECIFIED",
        "FAILED_SEARCH",
        "NO_NEW_CAPABILITY",
    ]
    assert search[2]["confirmedText"] == "A busca não identificou nenhuma abertura."
    assert "não há passagem" not in search[2]["confirmedText"]
    assert fixture["reviewPolicy"]["humanScores"] is None
