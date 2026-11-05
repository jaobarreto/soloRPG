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


def test_gemini_narration_generation_schema_avoids_large_nested_grammar_bounds(
    monkeypatch,
):
    from types import SimpleNamespace

    from app.narrative.schemas import Narration
    from app.providers.gemini import GeminiProvider

    async def generate(**kwargs):
        import json

        schema = kwargs["config"].response_json_schema
        serialized = json.dumps(schema)
        # Keep rich types/required/refs; bounds remain enforced locally. The
        # remote grammar should not expand 8 * 100 UUID slots and long texts.
        assert '"maxItems"' not in serialized
        assert '"maxLength"' not in serialized
        assert '"additionalProperties": false' in serialized
        assert '"$ref"' in serialized
        assert '"maxItems"' in json.dumps(Narration.model_json_schema())
        assert '"maxLength"' in json.dumps(Narration.model_json_schema())
        return SimpleNamespace(
            text='{"narrative":"Mira hesita.","eventIds":[]}', usage_metadata=None
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
        provider = GeminiProvider("fake", "gemini-3.5-flash-lite", 2)
        await provider.generate_structured(
            "synthetic", Narration, max_output_tokens=1200
        )
        await provider.close()

    asyncio.run(run())


def test_verified_current_free_model_is_configurable_without_changing_defaults(
    monkeypatch,
):
    monkeypatch.setattr("app.providers.router.GeminiProvider", adapter())
    router = ProviderRouter(settings(gemini_model="gemini-3.5-flash-lite"))
    assert (
        asyncio.run(
            router.generate_structured("data", Output, max_output_tokens=30)
        ).answer
        == "confirmado"
    )
    assert router.usage[0].model == "gemini-3.5-flash-lite"


def settings(**kwargs):
    return Settings(
        _env_file=None,
        ai_free_tier_confirmed=True,
        groq_free_tier_confirmed=True,
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


@pytest.mark.parametrize("measured", [True, False])
def test_gemini_official_sdk_contract(monkeypatch, measured):
    from types import SimpleNamespace

    from app.providers.gemini import GeminiProvider

    recorded = {}

    async def generate(**kwargs):
        recorded.update(kwargs)
        return SimpleNamespace(
            text='{"answer":"sim"}',
            usage_metadata=SimpleNamespace(
                prompt_token_count=8 if measured else None,
                candidates_token_count=2 if measured else None,
                total_token_count=10 if measured else None,
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
        assert provider.input_tokens == (8 if measured else 0)
        assert provider.usage_reported is measured
        assert recorded["config"].response_mime_type == "application/json"
        assert recorded["config"].max_output_tokens == 30
        await provider.close()

    asyncio.run(run())


def test_groq_requires_its_own_confirmation_even_with_a_key(monkeypatch):
    monkeypatch.setattr(
        "app.providers.router.GeminiProvider", adapter(status_error(429))
    )
    monkeypatch.setattr("app.providers.router.GroqProvider", adapter())
    config = Settings(
        _env_file=None,
        ai_free_tier_confirmed=True,
        gemini_api_key="fake",
        groq_api_key="fake",
        enable_provider_fallback=True,
    )
    router = ProviderRouter(config)
    with pytest.raises(ProviderError, match="FREE_TIER_NOT_CONFIRMED"):
        asyncio.run(router.generate_structured("data", Output, max_output_tokens=30))
    assert len(router.usage) == 1


def test_request_budget_is_checked_before_a_fallback_call(monkeypatch):
    monkeypatch.setattr(
        "app.providers.router.GeminiProvider", adapter(status_error(429))
    )
    monkeypatch.setattr("app.providers.router.GroqProvider", adapter())
    router = ProviderRouter(settings(enable_provider_fallback=True), max_requests=1)
    with pytest.raises(ProviderError, match="REQUEST_BUDGET"):
        asyncio.run(router.generate_structured("data", Output, max_output_tokens=30))
    assert len(router.usage) == 1


def test_failure_still_records_context_size_without_claiming_measured_tokens(
    monkeypatch,
):
    monkeypatch.setattr("app.providers.router.GeminiProvider", adapter(TimeoutError()))
    router = ProviderRouter(settings())
    with pytest.raises(ProviderError, match="TIMEOUT"):
        asyncio.run(
            router.generate_structured("ação livre", Output, max_output_tokens=30)
        )
    usage = router.usage[0]
    assert usage.inputCharacters == len("ação livre")
    assert usage.usageReported is False
    assert usage.totalTokens is None


def test_fallback_shares_a_total_deadline(monkeypatch):
    waits = []
    real_wait = asyncio.wait_for

    async def bounded_wait(awaitable, timeout):
        waits.append(timeout)
        return await real_wait(awaitable, timeout)

    class SlowPrimary(adapter()):
        async def generate_structured(self, *args, **kwargs):
            await asyncio.sleep(0.02)
            raise status_error(503)

    monkeypatch.setattr("app.providers.router.GeminiProvider", SlowPrimary)
    monkeypatch.setattr("app.providers.router.GroqProvider", adapter())
    monkeypatch.setattr("app.providers.router.asyncio.wait_for", bounded_wait)
    router = ProviderRouter(
        settings(enable_provider_fallback=True, llm_turn_timeout_seconds=1)
    )
    asyncio.run(router.generate_structured("data", Output, max_output_tokens=30))
    assert 0 < waits[2] < waits[0] <= 1
    assert len(router.usage) == 2


def test_unexpected_sdk_errors_are_redacted_and_do_not_retry(monkeypatch):
    monkeypatch.setattr(
        "app.providers.router.GeminiProvider",
        adapter(RuntimeError("PRIVATE SDK SECRET")),
    )
    router = ProviderRouter(settings(enable_provider_fallback=True))
    with pytest.raises(ProviderError, match="UNAVAILABLE") as error:
        asyncio.run(router.generate_structured("data", Output, max_output_tokens=30))
    assert "PRIVATE" not in str(error.value)
    assert len(router.usage) == 1
