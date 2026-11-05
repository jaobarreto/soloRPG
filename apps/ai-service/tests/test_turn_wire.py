import json
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings
from app.main import create_app
from app.narrative.schemas import TurnResponse


@pytest.mark.parametrize(
    "fixture", ["ai-turn-response.json", "ai-free-turn-response.json"]
)
def test_fastapi_serializes_the_same_contract_consumed_by_nestjs(monkeypatch, fixture):
    wire = json.loads(
        (
            Path(__file__).parents[3] / "packages/shared-contracts/fixtures" / fixture
        ).read_text()
    )
    monkeypatch.setenv("AI_INTERNAL_TOKEN", "fake-contract-token")
    get_settings.cache_clear()

    class PreparedRouter:
        def __init__(self, settings):
            self.usage = TurnResponse.model_validate(wire).usage

        async def generate_structured(self, prompt, schema, **kwargs):
            return schema.model_validate(wire["proposal"])

    monkeypatch.setattr("app.api.routes.narrative.ProviderRouter", PreparedRouter)
    try:
        with TestClient(create_app()) as client:
            response = client.post(
                "/internal/turn",
                headers={"X-AI-Token": "fake-contract-token"},
                json={
                    "actionId": str(uuid4()),
                    "campaignId": str(uuid4()),
                    "sessionId": str(uuid4()),
                    "stage": "PROPOSE",
                    "interactionMode": "SPEAK",
                    "playerMessage": "Podemos conversar?",
                    "context": {},
                    "confirmed": None,
                },
            )
        assert response.status_code == 200
        assert response.json() == wire
    finally:
        get_settings.cache_clear()
