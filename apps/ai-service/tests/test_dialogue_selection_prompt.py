"""Offline PROPOSE wire checks. Simulated outputs are not language judgments."""

import asyncio
import json
from types import SimpleNamespace

import pytest
from test_gemini_schema import forbid_network  # noqa: F401

from app.narrative.graph import run_turn
from app.narrative.schemas import TurnRequest
from app.providers import gemini
from app.providers.gemini import GeminiProvider

MENU = [
    {
        "name": "Mira",
        "choices": [
            {"topic": "disagreement", "act": "ANSWER"},
            {"topic": "disagreement", "act": "DISAGREE"},
            {"topic": "conversation", "act": "CLARIFY"},
        ],
    },
    {"name": "Aren", "choices": [{"topic": "promise", "act": "ANSWER"}]},
]


@pytest.mark.parametrize(
    "message,name,expression,tool",
    [
        (
            "Ainda pretende voltar?",
            "Aren",
            "QUESTION",
            {"type": "DIALOGUE", "topic": "promise", "act": "ANSWER"},
        ),
        (
            "Gostaria de entender por que você discorda.",
            "Mira",
            "QUESTION",
            {"type": "DIALOGUE", "topic": "disagreement", "act": "ANSWER"},
        ),
        (
            "Não concordo com sua posição.",
            "Mira",
            "DIRECT",
            {"type": "DIALOGUE", "topic": "disagreement", "act": "DISAGREE"},
        ),
        (
            "O que você quis dizer com isso?",
            "Mira",
            "QUESTION",
            {"type": "DIALOGUE", "topic": "conversation", "act": "CLARIFY"},
        ),
        (
            "Pode explicar o que houve?",
            None,
            "QUESTION",
            {"type": "CLARIFY", "question": "A quem e a que episódio se refere?"},
        ),
        ("O que você sabe sobre a carta?", "Aren", "QUESTION", {"type": "DIALOGUE"}),
        # Wrong fixture on purpose: the graph must not repair an unauthorized pair.
        (
            "Qual é a sua posição?",
            "Mira",
            "DIRECT",
            {"type": "DIALOGUE", "topic": "disagreement", "act": "CLARIFY"},
        ),
    ],
)
def test_production_propose_instructions_and_unmodified_output(
    monkeypatch, message, name, expression, tool
):
    payload = {
        "kind": "FREE",
        "intent": "TALK",
        "description": "Interpretar a fala.",
        "target": {"type": "CHARACTER", "name": name} if name else None,
        "expression": expression,
        "evidence": [],
        "tool": tool,
    }

    def inspect(body):
        system = " ".join(body["config"].system_instruction.split())
        assert "ato da réplica do NPC" in system
        assert "ANSWER responde ao ponto já identificado" in system
        assert "CLARIFY pede à jogadora que especifique" in system
        assert "Copie um único par (topic, act)" in system
        assert "pergunta cortês que pede uma explicação continua QUESTION" in system
        prompt = json.loads(body["contents"].removeprefix("DADOS:\n"))
        assert prompt["playerMessage"] == message
        assert prompt["context"]["dialogue"] == MENU
        assert "NÃO ENVIAR" not in json.dumps(prompt, ensure_ascii=False)

    recorded = []

    async def generate_content(**kwargs):
        recorded.append(kwargs)
        return SimpleNamespace(text=json.dumps(payload), usage_metadata=None)

    async def aclose():
        pass

    def client(**kwargs):
        return SimpleNamespace(
            aio=SimpleNamespace(
                models=SimpleNamespace(generate_content=generate_content),
                aclose=aclose,
            )
        )

    monkeypatch.setattr(gemini.genai, "Client", client)

    async def run():
        provider = GeminiProvider("synthetic-not-a-key", "gemini-3.5-flash-lite", 2)
        try:
            request = TurnRequest.model_validate(
                {
                    "stage": "PROPOSE",
                    "actionId": "00000000-0000-4000-8000-000000000001",
                    "campaignId": "00000000-0000-4000-8000-000000000002",
                    "sessionId": "00000000-0000-4000-8000-000000000003",
                    "confirmed": None,
                    "interactionMode": "SPEAK",
                    "playerMessage": message,
                    "context": {
                        "freeActions": True,
                        "selection": {"information": []},
                        "dialogue": [{**d, "replies": ["NÃO ENVIAR"]} for d in MENU],
                    },
                }
            )
            response = await run_turn(request, provider)
            assert response.proposal.root.expression == expression
            assert response.proposal.root.model_dump()["tool"] == tool
        finally:
            await provider.close()

    asyncio.run(run())
    assert len(recorded) == 1
    inspect(recorded[0])
