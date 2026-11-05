from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.narrative.schemas import TurnRequest


def test_mentions_contract_utf16_and_legacy():
    base = dict(
        actionId=uuid4(),
        campaignId=uuid4(),
        sessionId=uuid4(),
        stage="PROPOSE",
        interactionMode="ACT",
        playerMessage="🙂 #Lampião Azul",
        context={},
        confirmed=None,
    )
    assert TurnRequest(**base).context == {}
    base["context"] = {
        "mentions": [
            dict(
                type="ITEM",
                entityId=str(uuid4()),
                label="Lampião Azul",
                start=3,
                end=16,
                literal="#Lampião Azul",
            )
        ]
    }
    assert TurnRequest(**base).context["mentions"][0]["start"] == 3
    base["context"]["mentions"][0]["start"] = 2
    with pytest.raises(ValidationError):
        TurnRequest(**base)


def test_fastapi_langgraph_receives_resolved_references_with_simulated_provider(
    monkeypatch,
):
    import json

    from fastapi.testclient import TestClient

    from app.core.config import get_settings
    from app.main import create_app

    monkeypatch.setenv("AI_INTERNAL_TOKEN", "phase55-fake-token")
    get_settings.cache_clear()
    calls = []

    class FakeRouter:
        def __init__(self, settings):
            self.usage = []

        async def generate_structured(self, prompt, schema, **kwargs):
            calls.append(json.loads(prompt.split("DADOS:\n", 1)[1]))
            return schema.model_validate(
                dict(
                    kind="FREE",
                    intent="TALK",
                    description="Conversar",
                    target=dict(type="CHARACTER", name="Eileen"),
                    tool=dict(type="DIALOGUE"),
                )
            )

    monkeypatch.setattr("app.api.routes.narrative.ProviderRouter", FakeRouter)
    reference = dict(
        type="CHARACTER",
        entityId=str(uuid4()),
        label="Eileen",
        start=0,
        end=7,
        literal="@Eileen",
    )
    payload = dict(
        actionId=str(uuid4()),
        campaignId=str(uuid4()),
        sessionId=str(uuid4()),
        stage="PROPOSE",
        interactionMode="SPEAK",
        playerMessage="@Eileen, olá",
        context=dict(freeActions=True, mentions=[reference]),
        confirmed=None,
    )
    try:
        with TestClient(create_app()) as client:
            result = client.post(
                "/internal/turn",
                headers={"X-AI-Token": "phase55-fake-token"},
                json=payload,
            )
            assert result.status_code == 200
            assert result.json()["proposal"]["target"]["name"] == "Eileen"
            assert calls[0]["context"]["mentions"] == [reference]
            payload["context"]["mentions"][0]["type"] = "ADMIN"
            assert (
                client.post(
                    "/internal/turn",
                    headers={"X-AI-Token": "phase55-fake-token"},
                    json=payload,
                ).status_code
                == 422
            )
            assert len(calls) == 1
    finally:
        get_settings.cache_clear()
