"""Production SDK wire and validation tests. All HTTP uses in-memory transport."""

import asyncio
import copy
import json
import socket
from pathlib import Path

import httpx
import pytest

from app.core.config import Settings
from app.evaluation.selection import cases
from app.narrative.graph import run_turn
from app.narrative.prompts import MASTER
from app.narrative.schemas import SelectedFreeAction, TurnRequest
from app.providers.errors import ProviderError
from app.providers.gemini import GeminiProvider
from app.providers.router import ProviderRouter

ROOT = Path(__file__).resolve().parents[3]
PLAN = json.loads((ROOT / "docs/ai/phase-5.6.1-plan.json").read_text())
RECEIPT = json.loads((ROOT / "docs/ai/phase-5.6.1-live-result.json").read_text())


@pytest.fixture(autouse=True)
def forbid_network(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError("External network is forbidden in schema tests")

    monkeypatch.setattr(socket.socket, "connect", forbidden)
    monkeypatch.setattr(socket.socket, "connect_ex", forbidden)
    monkeypatch.setattr(socket, "create_connection", forbidden)


def install_transport(monkeypatch, payload, inspect_request):
    from app.providers import gemini

    real_client = gemini.genai.Client
    recorded = []

    def handle(request):
        body = json.loads(request.content)
        recorded.append(body)
        inspect_request(body)
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "content": {
                            "role": "model",
                            "parts": [
                                {"text": json.dumps(payload)},
                            ],
                        },
                        "finishReason": "STOP",
                    }
                ],
                "modelVersion": "gemini-3.5-flash-lite",
                "usageMetadata": {
                    "promptTokenCount": 20,
                    "candidatesTokenCount": 10,
                    "totalTokenCount": 30,
                },
            },
        )

    def create(**kwargs):
        options = kwargs["http_options"]
        assert options.retry_options.attempts == 1
        transport = httpx.MockTransport(handle)
        kwargs["http_options"] = options.model_copy(
            update={
                "httpx_async_client": httpx.AsyncClient(transport=transport),
                "httpx_client": httpx.Client(transport=transport),
            }
        )
        return real_client(**kwargs)

    monkeypatch.setattr(gemini.genai, "Client", create)
    return recorded


def schema_at_wire(body):
    assert body["generationConfig"]["maxOutputTokens"] == 700
    schema = body["generationConfig"]["responseJsonSchema"]
    assert "kind" in schema["required"]
    assert schema["properties"]["kind"] == {
        "type": "string",
        "title": "Kind",
        "enum": ["FREE"],
    }
    assert '"const":' not in json.dumps(schema)
    return schema


def test_sdk_wire_requires_free_without_mutating_local_schema(monkeypatch):
    before = copy.deepcopy(SelectedFreeAction.model_json_schema())
    assert before["properties"]["kind"]["const"] == "FREE"

    def inspect(body):
        remote = schema_at_wire(body)
        assert body["systemInstruction"]["parts"][0]["text"] == MASTER
        assert remote["additionalProperties"] is False
        assert {"expression", "evidence"} <= set(remote["required"])
        assert remote["properties"]["tool"] == before["properties"]["tool"]
        assert remote["$defs"]["PreparedCheckTool"]["properties"]["type"]["enum"] == [
            "PREPARED_CHECK",
        ]
        assert remote["$defs"]["RestTool"]["properties"]["sustenanceConfirmed"][
            "anyOf"
        ][0]["enum"] == [True]

    proposal = PLAN["cases"][0]["offlineProposal"]
    recorded = install_transport(monkeypatch, proposal, inspect)

    async def run():
        provider = GeminiProvider("synthetic-not-a-key", "gemini-3.5-flash-lite", 2)
        try:
            parsed = await provider.generate_structured(
                "data",
                SelectedFreeAction,
                max_output_tokens=700,
            )
            assert parsed.model_dump(mode="json")["kind"] == "FREE"
        finally:
            await provider.close()

    asyncio.run(run())
    assert len(recorded) == 1
    assert SelectedFreeAction.model_json_schema() == before


def test_real_invalid_response_is_rejected_after_sdk_without_normalization(monkeypatch):
    raw = json.loads(RECEIPT["rows"][0]["rawResponse"])
    before = copy.deepcopy(raw)
    assert raw["kind"] == "QUERY"
    recorded = install_transport(monkeypatch, raw, schema_at_wire)

    async def run():
        provider = GeminiProvider("synthetic-not-a-key", "gemini-3.5-flash-lite", 2)
        try:
            with pytest.raises(ProviderError, match="INVALID_RESPONSE") as exc:
                await provider.generate_structured(
                    "data",
                    SelectedFreeAction,
                    max_output_tokens=700,
                )
            assert exc.value.validation_issues == ["kind:literal_error"]
        finally:
            await provider.close()

    asyncio.run(run())
    assert len(recorded) == 1
    assert raw == before


@pytest.mark.parametrize("scenario", cases(), ids=lambda c: c["id"])
def test_tool_matrix_crosses_production_graph_router_adapter_and_sdk_offline(
    monkeypatch, scenario
):
    proposal = scenario["proposal"]
    recorded = install_transport(monkeypatch, proposal, schema_at_wire)
    request = TurnRequest.model_validate(
        {
            **PLAN["cases"][0]["request"],
            "interactionMode": scenario["mode"],
            "playerMessage": scenario["message"],
            "context": scenario["context"],
        }
    )
    settings = Settings(
        _env_file=None,
        gemini_api_key="synthetic-not-a-key",
        ai_free_tier_confirmed=True,
        enable_provider_fallback=False,
    )
    router = ProviderRouter(settings, max_requests=1)
    response = asyncio.run(run_turn(request, router))
    parsed = response.proposal.root
    assert parsed.intent == proposal["intent"]
    assert parsed.tool.type == proposal["tool"]["type"]
    assert parsed.expression == proposal["expression"]
    assert parsed.evidence == proposal["evidence"]
    assert router.usage[0].error is None
    assert len(router.usage) == len(recorded) == 1
