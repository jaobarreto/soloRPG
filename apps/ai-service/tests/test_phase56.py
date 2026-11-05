import asyncio
import json
from uuid import uuid4

import pytest

from app.core.config import Settings
from app.evaluation.selection import cases, evaluate, plan, summarize
from app.narrative.graph import run_turn
from app.narrative.schemas import Narration, SelectedFreeAction, TurnRequest
from app.narrative.selection import planner_request
from app.providers.errors import ProviderError


def request(scenario):
    return TurnRequest(
        actionId=uuid4(),
        campaignId=uuid4(),
        sessionId=uuid4(),
        stage="PROPOSE",
        interactionMode=scenario["mode"],
        playerMessage=scenario["message"],
        context=scenario["context"],
        confirmed=None,
    )


@pytest.mark.parametrize("scenario", cases(), ids=lambda c: c["id"])
def test_matrix_crosses_production_graph_with_scripted_provider(scenario):
    class Scripted:
        async def generate_structured(self, prompt, schema, **kwargs):
            assert schema is SelectedFreeAction
            assert kwargs["max_output_tokens"] == 700
            payload = json.loads(prompt.removeprefix("DADOS:\n"))
            assert payload["playerMessage"] == scenario["message"]
            assert "gm" not in payload["context"]
            assert "characters" not in payload["context"]
            return schema.model_validate(scenario["proposal"])

    response = asyncio.run(run_turn(request(scenario), Scripted()))
    assert response.proposal.root.intent == scenario["proposal"]["intent"]
    assert response.proposal.root.tool.type == scenario["proposal"]["tool"]["type"]


def test_free_planner_gets_no_gm_or_other_npc_knowledge_or_persistent_check_ids():
    req = request(cases()[0])
    req.context.update(
        {
            "adventure": {"gm": {"secret": "PRIVATE"}},
            "previous": [{"summary": "PRIVATE"}],
            "recent": [{"content": "PRIVATE"}],
        }
    )
    req.context["characters"][1]["knowledge"] = [{"description": "PRIVATE"}]
    view = planner_request(req).model_dump_json()
    assert "PRIVATE" not in view
    assert "scene" in view  # authorized source key, not a GM-only scene
    assert "targetNumber" not in view
    req.context["recent"] = [
        {"role": "PLAYER", "mode": "THINK", "content": "PRIVATE_THOUGHT"},
        {"role": "PLAYER", "mode": "OUT_OF_CHARACTER", "content": "PRIVATE_OOC"},
        {"role": "PLAYER", "mode": "SPEAK", "content": "Porta mencionada"},
    ]
    public_view = planner_request(req).model_dump_json()
    assert "PRIVATE_THOUGHT" not in public_view
    assert "PRIVATE_OOC" not in public_view
    assert "Porta mencionada" in public_view


def test_invalid_interpretation_falls_back_once_without_repair():
    class Invalid:
        calls = 0

        async def generate_structured(self, prompt, schema, **kwargs):
            self.calls += 1
            raise ProviderError("INVALID_RESPONSE")

    provider = Invalid()
    response = asyncio.run(run_turn(request(cases()[0]), provider))
    assert response.proposal.root.tool.type == "CLARIFY"
    assert provider.calls == 1


@pytest.mark.parametrize("category", ["OOC", "OBSERVE", "QUERY"])
def test_information_rendering_never_spends_a_second_call(category):
    class Forbidden:
        async def generate_structured(self, *args, **kwargs):
            raise AssertionError("No literary embellishment of sourced information")

    req = request(cases()[0]).model_copy(
        update={
            "stage": "NARRATE",
            "context": {"rendering": {"category": category}},
            "confirmed": Narration(narrative="Fonte autorizada.", eventIds=[]),
        }
    )
    assert asyncio.run(run_turn(req, Forbidden())).narration == req.confirmed


def test_no_live_call_without_new_authorization(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("Provider must not be created")

    monkeypatch.setattr("app.evaluation.selection.ProviderRouter", forbidden)
    with pytest.raises(ProviderError, match="LIVE_AUTHORIZATION_REQUIRED"):
        asyncio.run(evaluate(Settings(_env_file=None), authorized=False))
    assert plan()["maxRequests"] == 8
    assert plan()["maxOutputTokensPerRequest"] == 700


@pytest.mark.parametrize(
    "changes,code",
    [
        ({"ai_free_tier_confirmed": False}, "FREE_TIER_NOT_CONFIRMED"),
        ({"llm_provider": "groq"}, "GEMINI_REQUIRED"),
        ({"enable_provider_fallback": True}, "FALLBACK_MUST_BE_DISABLED"),
    ],
)
def test_live_probe_preserves_financial_configuration(monkeypatch, changes, code):
    def forbidden(*args, **kwargs):
        raise AssertionError("No provider on a failed gate")

    monkeypatch.setattr("app.evaluation.selection.ProviderRouter", forbidden)
    settings = Settings(_env_file=None, ai_free_tier_confirmed=True).model_copy(
        update=changes
    )
    with pytest.raises(ProviderError, match=code):
        asyncio.run(evaluate(settings, authorized=True))


@pytest.mark.parametrize(
    "behavior,expected_count",
    [("valid", 8), ("unsafe", 1), ("invalid", 1), ("timeout", 1)],
)
def test_live_probe_budget_and_interruptions_use_only_simulated_provider(
    monkeypatch, behavior, expected_count
):
    ids = [c["id"] for c in plan()["cases"]]
    index = {c["id"]: c for c in cases()}
    count = 0

    class SimulatedRouter:
        def __init__(self, settings, max_requests):
            assert max_requests == 1
            self.usage = []
            self.validation_issues = []

        async def generate_structured(self, prompt, schema, **kwargs):
            nonlocal count
            case = index[ids[count]]
            count += 1
            if behavior == "timeout":
                raise ProviderError("TIMEOUT")
            if behavior == "invalid":
                from app.narrative.schemas import Usage

                self.usage.append(
                    Usage(
                        provider="gemini", model="simulated", error="INVALID_RESPONSE"
                    )
                )
                raise ProviderError("INVALID_RESPONSE")
            proposal = dict(case["proposal"])
            if behavior == "unsafe":
                proposal["tool"] = {
                    "type": "ARCANA",
                    "arcanum": "psychic-shield",
                    "raised": True,
                }
            return schema.model_validate(proposal)

    monkeypatch.setattr("app.evaluation.selection.ProviderRouter", SimulatedRouter)
    settings = Settings(_env_file=None, ai_free_tier_confirmed=True)
    original = settings.model_dump()
    report = asyncio.run(evaluate(settings, authorized=True))
    assert len(report["rows"]) == expected_count
    assert count == expected_count
    assert report["authorizationEvaluated"] is False
    assert settings.model_dump() == original


@pytest.mark.parametrize("budget", [0, 9])
def test_probe_rejects_excess_or_empty_budget(budget):
    with pytest.raises(ProviderError, match="REQUEST_BUDGET"):
        asyncio.run(
            evaluate(
                Settings(_env_file=None, ai_free_tier_confirmed=True),
                authorized=True,
                max_requests=budget,
            )
        )


def test_confusion_metrics_separate_fp_fn_fallback_and_missing_authorization():
    report = summarize(
        [
            {
                "expectedTool": "PREPARED_CHECK",
                "selectedTool": "QUERY",
                "expectedIntent": "INVESTIGATE",
                "selectedIntent": "INVESTIGATE",
                "authorizedTool": None,
            },
            {
                "expectedTool": "QUERY",
                "selectedTool": "ARCANA",
                "expectedIntent": "QUERY",
                "selectedIntent": "ARCANA",
                "authorizedTool": "CLARIFY",
                "fallback": True,
            },
        ]
    )
    assert report["tools"]["ARCANA"]["falsePositive"] == 1
    assert report["tools"]["PREPARED_CHECK"]["falseNegative"] == 1
    assert report["confusion"]["QUERY"]["ARCANA"] == 1
    assert report["unauditedAuthorization"] == 1


def test_required_context_groups_and_all_categories_are_present():
    scenarios = cases()
    assert len(scenarios) >= 50
    assert set("ABCDEFGH") <= {c["category"] for c in scenarios}
    groups = {c.get("contextGroup") for c in scenarios} - {None}
    assert len(groups) == 8
    for group in groups:
        members = [c for c in scenarios if c.get("contextGroup") == group]
        assert len({c["message"] for c in members}) == 1
        assert len({c["contextState"] for c in members}) == 5
