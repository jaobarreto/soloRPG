import asyncio

import pytest

from app.core.config import Settings
from app.evaluation.live import validate
from app.providers.errors import ProviderError


@pytest.mark.parametrize(
    "authorized,free,code",
    [
        (False, False, "LIVE_AUTHORIZATION_REQUIRED"),
        (False, True, "LIVE_AUTHORIZATION_REQUIRED"),
        (True, False, "FREE_TIER_NOT_CONFIRMED"),
    ],
)
def test_live_probe_requires_both_gates_before_any_sdk_use(
    monkeypatch, authorized, free, code
):
    def forbidden(*args, **kwargs):
        raise AssertionError("No provider may be constructed before confirmation")

    monkeypatch.setattr("app.evaluation.live.ProviderRouter", forbidden)
    with pytest.raises(ProviderError, match=code):
        asyncio.run(
            validate(
                Settings(_env_file=None, ai_free_tier_confirmed=free),
                authorized=authorized,
                max_requests=1,
            )
        )


def test_two_request_probe_uses_same_adapter_and_disables_fallback(monkeypatch):
    class Adapter:
        def __init__(self, config, max_requests):
            assert not config.enable_provider_fallback
            assert max_requests == 2
            self.usage = []
            self.calls = 0

        async def generate_structured(self, prompt, schema, **kwargs):
            self.calls += 1
            assert self.calls <= 2
            if self.calls == 1:
                return schema(answer="Mestre de RPG conectado com sucesso.")
            return schema(narrative="Theron hesita. — Ainda não sei.", eventIds=[])

    monkeypatch.setattr("app.evaluation.live.ProviderRouter", Adapter)
    result = asyncio.run(
        validate(
            Settings(
                _env_file=None,
                ai_free_tier_confirmed=True,
                enable_provider_fallback=True,
            ),
            authorized=True,
            max_requests=2,
        )
    )
    assert result["results"][0]["passed"]
    assert result["results"][1]["humanReviewRequired"]
    assert result["campaignWrites"] is False
