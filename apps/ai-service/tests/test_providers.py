import asyncio

import httpx
import pytest
from pydantic import BaseModel

from app.core.config import Settings
from app.providers.errors import ProviderError, status_error
from app.providers.groq import GroqProvider
from app.providers.router import ProviderRouter


class Output(BaseModel):
    answer: str


def settings(**kwargs):
    return Settings(
        _env_file=None,
        ai_free_tier_confirmed=True,
        gemini_api_key="fake-gemini",
        groq_api_key="fake-groq",
        **kwargs,
    )


def adapter(error=None):
    class Fake:
        def __init__(self, *args):
            self.input_tokens = 12
            self.output_tokens = 3

        async def generate_structured(self, prompt, schema, **kwargs):
            if error:
                raise error
            return schema(answer="confirmado")

        async def close(self):
            pass

    return Fake


@pytest.mark.parametrize(
    "error",
    [
        status_error(429),
        status_error(503),
        TimeoutError(),
        httpx.ConnectError("secret"),
    ],
)
def test_free_fallback_is_bounded_and_metrics_are_sanitized(monkeypatch, error):
    monkeypatch.setattr("app.providers.router.GeminiProvider", adapter(error))
    monkeypatch.setattr("app.providers.router.GroqProvider", adapter())
    router = ProviderRouter(settings(enable_provider_fallback=True))
    result = asyncio.run(
        router.generate_structured("data", Output, max_output_tokens=30)
    )
    assert result.answer == "confirmado"
    assert len(router.usage) == 2
    assert router.usage[0].error is not None
    assert router.usage[1].error is None
    assert "secret" not in str(router.usage)


@pytest.mark.parametrize("status", [400, 401, 403, 404])
def test_permanent_errors_do_not_spend_fallback_quota(monkeypatch, status):
    monkeypatch.setattr(
        "app.providers.router.GeminiProvider", adapter(status_error(status))
    )
    router = ProviderRouter(settings(enable_provider_fallback=True))
    with pytest.raises(ProviderError):
        asyncio.run(router.generate_structured("data", Output, max_output_tokens=30))
    assert len(router.usage) == 1


def test_both_providers_unavailable(monkeypatch):
    monkeypatch.setattr(
        "app.providers.router.GeminiProvider", adapter(status_error(429))
    )
    monkeypatch.setattr("app.providers.router.GroqProvider", adapter(status_error(503)))
    router = ProviderRouter(settings(enable_provider_fallback=True))
    with pytest.raises(ProviderError):
        asyncio.run(router.generate_structured("data", Output, max_output_tokens=30))
    assert len(router.usage) == 2


@pytest.mark.parametrize(
    "config,code",
    [
        ({"ai_free_tier_confirmed": False}, "FREE_TIER_NOT_CONFIRMED"),
        ({"gemini_model": "paid-only-model"}, "MODEL_NOT_FREE_ALLOWLISTED"),
    ],
)
def test_no_unapproved_paid_configuration(config, code):
    config = {"ai_free_tier_confirmed": True, "gemini_api_key": "fake", **config}
    router = ProviderRouter(Settings(_env_file=None, **config))
    with pytest.raises(ProviderError, match=code):
        asyncio.run(router.generate_structured("data", Output, max_output_tokens=30))


def test_groq_wire_contract_and_invalid_response():
    async def run():
        provider = GroqProvider("fake", "openai/gpt-oss-20b", 2)
        await provider.client.aclose()

        def handle(request):
            assert request.headers["authorization"] == "Bearer fake"
            assert request.url.path == "/openai/v1/chat/completions"
            return httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": '{"answer":"sim"}'}}],
                    "usage": {"prompt_tokens": 5, "completion_tokens": 2},
                },
            )

        provider.client = httpx.AsyncClient(
            base_url="https://api.groq.com/openai/v1/",
            headers={"Authorization": "Bearer fake"},
            transport=httpx.MockTransport(handle),
        )
        assert (
            await provider.generate_structured("data", Output, max_output_tokens=30)
        ).answer == "sim"
        assert provider.input_tokens == 5
        await provider.close()

    asyncio.run(run())


def test_gemini_official_sdk_contract(monkeypatch):
    from types import SimpleNamespace

    from app.providers.gemini import GeminiProvider

    recorded = {}

    async def generate(**kwargs):
        recorded.update(kwargs)
        return SimpleNamespace(
            text='{"answer":"sim"}',
            usage_metadata=SimpleNamespace(
                prompt_token_count=8, candidates_token_count=2
            ),
        )

    async def close():
        pass

    fake = SimpleNamespace(
        aio=SimpleNamespace(
            models=SimpleNamespace(generate_content=generate), aclose=close
        )
    )
    monkeypatch.setattr("app.providers.gemini.genai.Client", lambda **kwargs: fake)

    async def run():
        provider = GeminiProvider("fake", "gemini-2.5-flash-lite", 2)
        assert (
            await provider.generate_structured("data", Output, max_output_tokens=30)
        ).answer == "sim"
        assert provider.input_tokens == 8
        assert recorded["config"].response_mime_type == "application/json"
        assert recorded["config"].max_output_tokens == 30
        await provider.close()

    asyncio.run(run())
