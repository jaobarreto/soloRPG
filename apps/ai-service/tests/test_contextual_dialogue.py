import asyncio
import json
import socket
from uuid import uuid4

import pytest
from pydantic import ValidationError
from test_gemini_schema import install_transport, schema_at_wire

from app.narrative.graph import run_turn
from app.narrative.schemas import Narration, SelectedFreeAction, TurnRequest
from app.narrative.selection import planner_request
from app.providers.gemini import GeminiProvider


@pytest.fixture(autouse=True)
def no_external_network(monkeypatch):
    def blocked(*args, **kwargs):
        raise AssertionError("Network forbidden in contextual dialogue tests")

    monkeypatch.setattr(socket.socket, "connect", blocked)
    monkeypatch.setattr(socket.socket, "connect_ex", blocked)


def request():
    return TurnRequest(
        actionId=uuid4(),
        campaignId=uuid4(),
        sessionId=uuid4(),
        stage="PROPOSE",
        interactionMode="SPEAK",
        playerMessage="Iria, o que pensa da discussão anterior?",
        context={
            "freeActions": True,
            "selection": {"version": 1, "information": []},
            "dialogue": [
                {
                    "characterId": str(uuid4()),
                    "name": "Iria",
                    "privateBinding": "SECRET",
                    "choices": [
                        {"topic": "disagreement", "act": "ANSWER", "secret": "SECRET"}
                    ],
                }
            ],
        },
        confirmed=None,
    )


def test_least_privilege_planner_forwards_only_available_topic_and_act():
    context = planner_request(request()).context
    assert context["dialogue"] == [
        {"name": "Iria", "choices": [{"topic": "disagreement", "act": "ANSWER"}]}
    ]
    assert "SECRET" not in json.dumps(context)


def test_planner_projects_passages_without_private_destinations():
    turn = request()
    turn.context["navigation"] = {
        "name": "Estufa",
        "visits": 2,
        "privateRoute": "SECRET",
        "exits": [
            {
                "label": "Porta externa soterrada",
                "status": "BLOCKED",
                "destination": "SECRET",
            }
        ],
    }
    projected = planner_request(turn).context["navigation"]
    assert projected == {
        "name": "Estufa",
        "visits": 2,
        "exits": [{"label": "Porta externa soterrada", "status": "BLOCKED"}],
    }


def test_legacy_dialogue_wire_omits_only_absent_new_selectors():
    from app.narrative.schemas import DialogueTool

    assert DialogueTool(type="DIALOGUE").model_dump() == {"type": "DIALOGUE"}
    assert DialogueTool(
        type="DIALOGUE", topic="conversation", act="ANSWER"
    ).model_dump() == {"type": "DIALOGUE", "topic": "conversation", "act": "ANSWER"}


def test_sdk_transmits_strict_selectors_without_source_or_effect_authority(monkeypatch):
    proposal = {
        "kind": "FREE",
        "intent": "TALK",
        "description": "Perguntar",
        "target": {"type": "CHARACTER", "name": "Iria"},
        "expression": "QUESTION",
        "evidence": [],
        "tool": {"type": "DIALOGUE", "topic": "disagreement", "act": "ANSWER"},
    }

    def inspect(body):
        schema = schema_at_wire(body)
        tool = schema["$defs"]["DialogueTool"]
        assert tool["additionalProperties"] is False
        assert {"type", "topic", "act"} == set(tool["properties"])
        assert "SECRET" not in body["contents"][0]["parts"][0]["text"]

    recorded = install_transport(monkeypatch, proposal, inspect)

    async def run():
        provider = GeminiProvider("synthetic-not-a-key", "gemini-3.5-flash-lite", 2)
        try:
            result = await run_turn(request(), provider)
            assert result.proposal.root.tool.topic == "disagreement"
            assert result.proposal.root.tool.act == "ANSWER"
        finally:
            await provider.close()

    asyncio.run(run())
    assert len(recorded) == 1
    for extra in [
        {"effect": "HELP"},
        {"sources": ["secret"]},
        {"text": "Una inventou uma resposta"},
        {"libraryId": "evil"},
    ]:
        with pytest.raises(ValidationError):
            SelectedFreeAction.model_validate(
                {**proposal, "tool": {**proposal["tool"], **extra}}
            )


def test_contextual_reply_uses_unchanged_narrate_contract_and_whole_text():
    beat = {
        "kind": "DIALOGUE",
        "speakerId": str(uuid4()),
        "text": "Iria — Ainda temos um desacordo.",
        "factIds": [],
    }

    class Scripted:
        async def generate_structured(self, prompt, schema, **kwargs):
            assert schema is Narration
            assert "disagreement" in prompt
            return schema.model_validate(
                {"narrative": beat["text"], "eventIds": [], "beats": [beat]}
            )

    req = request().model_copy(
        update={
            "stage": "NARRATE",
            "context": {
                "rendering": {
                    "category": "DIALOGUE",
                    "dialogue": {
                        "selection": {"topic": "disagreement", "act": "ANSWER"},
                        "replies": [{"beat": beat}],
                    },
                    "publication": {"version": 1, "choices": [beat]},
                }
            },
            "confirmed": Narration(narrative="Fala registrada.", eventIds=[]),
        }
    )
    response = asyncio.run(run_turn(req, Scripted()))
    assert response.narration.model_dump(mode="json")["beats"] == [beat]
