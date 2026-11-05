import asyncio
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.main import create_app
from app.narrative.graph import run_turn
from app.narrative.schemas import Proposal, TurnRequest


class FakeProvider:
    async def generate_structured(self, prompt, output_schema, *, max_output_tokens):
        return output_schema.model_validate({"kind": "OBSERVE"})


def turn(mode="ACT", stage="PROPOSE"):
    return TurnRequest(
        actionId=uuid4(),
        campaignId=uuid4(),
        sessionId=uuid4(),
        stage=stage,
        interactionMode=mode,
        playerMessage="Examino a parede.",
        context={"rules": [], "npcs": []},
        confirmed=None,
    )


@pytest.mark.parametrize(
    "mode", ["ACT", "SPEAK", "THINK", "OUT_OF_CHARACTER", "REQUEST_CHECK", "ROLL_RESULT"]
)
def test_six_modes_and_typed_graph(mode):
    result = asyncio.run(run_turn(turn(mode), FakeProvider()))
    assert result.proposal.kind == "OBSERVE"


def test_selected_mechanic_is_preserved_even_in_an_exceptional_scene():
    class ForbiddenProvider:
        async def generate_structured(self, *args, **kwargs):
            raise AssertionError("Selected mechanics do not need interpretation")

    request = turn()
    command = {"type": "CURE", "characterId": str(uuid4()), "targetId": str(uuid4())}
    request.context = {
        "selectedMechanic": command,
        "adventure": {"gm": {"localAdjudicationRequired": True}},
    }
    result = asyncio.run(run_turn(request, ForbiddenProvider()))
    assert result.proposal.kind == "MECHANIC"
    assert result.proposal.root.command.type == "CURE"
    request.interactionMode = "THINK"
    assert (
        asyncio.run(run_turn(request, ForbiddenProvider())).proposal.kind == "OBSERVE"
    )


@pytest.mark.parametrize(
    "command",
    [
        {
            "type": "ARCANA_USE",
            "input": {
                "arcanum": "wind-shaping",
                "characterId": str(uuid4()),
                "contextId": str(uuid4()),
                "category": 2,
                "damage": 99,
            },
        },
        {
            "type": "ADVENTURE_ACTION",
            "input": {
                "action": "RITUAL_ATTEMPT",
                "characterId": str(uuid4()),
                "task": "POEM",
                "benefit": "NONE",
                "declineStunts": True,
                "modifier": 10,
            },
        },
        {"type": "ARCANA_CONTEXT_SET", "contextId": str(uuid4())},
    ],
)
def test_mechanical_proposals_cannot_author_facts_or_results(command):
    with pytest.raises(ValidationError):
        Proposal.model_validate({"kind": "MECHANIC", "command": command})


@pytest.mark.parametrize(
    "payload",
    [
        {
            "kind": "ATTACK",
            "actorId": str(uuid4()),
            "targetId": str(uuid4()),
            "damage": 99,
        },
        {"kind": "RESOURCE_SET", "current": 0},
        {"kind": "OBSERVE", "objectiveCompleted": True},
        {"kind": "OBSERVE", "narrative": "Você ganha uma espada."},
    ],
)
def test_no_state_patches_or_early_narration(payload):
    with pytest.raises(ValidationError):
        Proposal.model_validate(payload)


def test_narrator_cannot_request_changes():
    from app.narrative.schemas import Narration

    with pytest.raises(ValidationError):
        Narration.model_validate({"narrative": "Olá", "eventIds": [], "proposal": {}})


def test_internal_routes_fail_closed(monkeypatch):
    from app.core.config import get_settings

    monkeypatch.setenv("AI_INTERNAL_TOKEN", "integration-only-token-1234567890")
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        assert client.post("/internal/turn", json={}).status_code == 401
        assert client.get("/health").status_code == 200
    get_settings.cache_clear()


def test_adventure_adjudication_never_delegates_unsupported_rules_to_model():
    class ForbiddenProvider:
        async def generate_structured(self, *args, **kwargs):
            raise AssertionError("Unsupported rules must not reach a model")

    request = turn()
    request.context = {
        "adventure": {"gm": {"localAdjudicationRequired": True}},
        "selectedOptionId": str(uuid4()),
    }
    result = asyncio.run(run_turn(request, ForbiddenProvider()))
    assert result.proposal.kind == "OBSERVE"
