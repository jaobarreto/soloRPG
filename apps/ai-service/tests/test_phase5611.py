"""Offline instructions/contract regressions, never a claim of model accuracy."""

import asyncio
import copy
import json
import socket
from pathlib import Path

import pytest
from test_gemini_schema import install_transport, schema_at_wire

from app.evaluation.phase561 import grade
from app.narrative.graph import run_turn
from app.narrative.prompts import MASTER
from app.narrative.schemas import SelectedFreeAction, TurnRequest
from app.providers.gemini import GeminiProvider

ROOT = Path(__file__).resolve().parents[3]
PLAN = json.loads((ROOT / "docs/ai/phase-5.6.1-plan.json").read_text())
FIXTURES = json.loads(
    (ROOT / "packages/shared-contracts/fixtures/phase5611-semantics.json").read_text()
)


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("External network forbidden in phase 5.6.1.1")

    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)


def test_historical_receipts_remain_wrong_without_reinterpretation():
    for name, case_id, failure in [
        ("phase-5.6.1-case561-01-schema-confirmation.json", "561-01", "EXPRESSION"),
        (
            "phase-5.6.1-completion-live-result.json",
            "561-06",
            "INVENTED_PARAMETER:tradition",
        ),
    ]:
        receipt = json.loads((ROOT / "docs/ai" / name).read_text())
        raw = json.loads(
            next(r for r in receipt["rows"] if r["id"] == case_id)["rawResponse"]
        )
        case = next(c for c in PLAN["cases"] if c["id"] == case_id)
        assert grade(case, raw) == {"passed": False, "failures": [failure]}
        parsed = SelectedFreeAction.model_validate(raw)
        assert parsed.expression == raw["expression"]
        if case_id == "561-06":
            assert parsed.tool.tradition == "PSYCHIC"


@pytest.mark.parametrize("scenario", FIXTURES["language"], ids=lambda c: c["id"])
def test_portuguese_speech_acts_reach_production_sdk_without_mode_reclassification(
    monkeypatch, scenario
):
    case = PLAN["cases"][0]
    payload = {
        **case["offlineProposal"],
        "intent": scenario["intent"],
        "expression": scenario["expression"],
        "tool": scenario["tool"],
        "evidence": case["expected"]["evidence"]
        if scenario["tool"]["type"] == "QUERY"
        else [],
    }

    def inspect(body):
        schema = schema_at_wire(body)
        instructions = body["systemInstruction"]["parts"][0]["text"]
        description = schema["properties"]["expression"].get("description", "")
        assert "interactionMode" in description and "intent" in description
        assert "QUESTION" in description and "DIRECT" in description
        if scenario["productionPromptExample"]:
            assert scenario["message"] in instructions
        prompt = json.loads(
            body["contents"][0]["parts"][0]["text"].removeprefix("DADOS:\n")
        )
        assert prompt["playerMessage"] == scenario["message"]
        assert prompt["interactionMode"] == "ACT"
        assert "expected" not in prompt and "offlineProposal" not in prompt

    recorded = install_transport(monkeypatch, payload, inspect)

    async def run():
        provider = GeminiProvider("synthetic-not-a-key", "gemini-3.5-flash-lite", 2)
        try:
            request = TurnRequest.model_validate(
                {**case["request"], "playerMessage": scenario["message"]}
            )
            response = await run_turn(request, provider)
            assert response.proposal.root.expression == scenario["expression"]
            assert response.proposal.root.tool.type == scenario["tool"]["type"]
        finally:
            await provider.close()

    asyncio.run(run())
    assert len(recorded) == 1


def test_arcana_generation_describes_applicability_without_hiding_invalid_values():
    schema = SelectedFreeAction.model_json_schema()
    fields = schema["$defs"]["ArcanaTool"]["properties"]
    for name, arcanum in [
        ("raised", "psychic-shield"),
        ("tradition", "psychic-contact"),
        ("use", "body-control"),
        ("fatigue", "move-object"),
        ("category", "wind-shaping"),
    ]:
        assert arcanum in fields[name].get("description", "")
    assert "Não deduza tradição pelo nome do arcano" in MASTER
    assert "psychic-shield: somente raised" in MASTER
    raw = {
        **PLAN["cases"][5]["offlineProposal"],
        "tool": {
            "type": "ARCANA",
            "arcanum": "psychic-shield",
            "raised": True,
            "tradition": "PSYCHIC",
        },
    }
    before = copy.deepcopy(raw)
    assert SelectedFreeAction.model_validate(raw).tool.tradition == "PSYCHIC"
    assert raw == before
