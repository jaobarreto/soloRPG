import asyncio
from uuid import uuid4

import pytest

from app.core.config import Settings
from app.evaluation.autonomous import validate
from app.narrative.graph import run_turn
from app.narrative.schemas import FreeAction, Narration, TurnRequest
from app.providers.errors import ProviderError


def test_validation_diagnostics_never_include_generated_values_or_unknown_fields(
    monkeypatch,
):
    from types import SimpleNamespace

    from app.providers.gemini import GeminiProvider

    async def generate(**kwargs):
        return SimpleNamespace(
            text='{"narrative":"PRIVATE_VALUE","eventIds":[],"PRIVATE_FIELD":"PRIVATE_VALUE"}',
            usage_metadata=None,
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
        provider = GeminiProvider("fake-secret-key", "gemini-3.5-flash-lite", 2)
        with pytest.raises(ProviderError) as failure:
            await provider.generate_structured(
                "synthetic", Narration, max_output_tokens=30
            )
        assert failure.value.code == "INVALID_RESPONSE"
        assert failure.value.validation_issues
        assert "PRIVATE" not in str(failure.value.validation_issues)
        assert "fake-secret" not in str(failure.value.validation_issues)
        await provider.close()

    asyncio.run(run())


def request(stage="PROPOSE", mode="SPEAK", context=None, confirmed=None):
    return TurnRequest(
        actionId=uuid4(),
        campaignId=uuid4(),
        sessionId=uuid4(),
        stage=stage,
        interactionMode=mode,
        playerMessage="Mira, podemos confiar em Aren?",
        context=context or {},
        confirmed=confirmed,
    )


def test_renderer_uses_the_provider_only_after_confirmed_results():
    calls = []

    class LiteraryProvider:
        async def generate_structured(self, prompt, schema, **kwargs):
            calls.append(prompt)
            return schema.model_validate(
                {
                    "narrative": "“O que despertou sua suspeita?”",
                    "eventIds": [],
                    "beats": [
                        {
                            "kind": "DIALOGUE",
                            "speakerId": str(speaker),
                            "text": "“O que despertou sua suspeita?”",
                            "factIds": [],
                        }
                    ],
                }
            )

    speaker = uuid4()
    confirmed = Narration(narrative="Mira ouviu a pergunta.", eventIds=[])
    context = {
        "rendering": {
            "category": "DIALOGUE",
            "speaker": {"id": str(speaker)},
            "facts": [],
        }
    }
    result = asyncio.run(
        run_turn(
            request("NARRATE", context=context, confirmed=confirmed), LiteraryProvider()
        )
    )
    assert len(calls) == 1
    assert result.narration.narrative != confirmed.narrative
    assert "Mira ouviu" in calls[0]


def test_renderer_assembles_beats_even_if_model_adds_a_bullet_in_redundant_text():
    class Provider:
        async def generate_structured(self, prompt, schema, **kwargs):
            return schema.model_validate(
                {
                    "narrative": "- Olá.",
                    "eventIds": [],
                    "beats": [
                        {
                            "kind": "DIALOGUE",
                            "speakerId": str(uuid4()),
                            "text": "Olá.",
                            "factIds": [],
                        }
                    ],
                }
            )

    result = asyncio.run(
        run_turn(
            request(
                "NARRATE",
                context={"rendering": {"category": "DIALOGUE"}},
                confirmed=Narration(narrative="Fala ouvida.", eventIds=[]),
            ),
            Provider(),
        )
    )
    assert result.narration.narrative == "Olá."


def test_ooc_can_explain_a_specific_question_using_public_rules():
    calls = []

    class Interpreter:
        async def generate_structured(self, prompt, schema, **kwargs):
            calls.append(prompt)
            return schema.model_validate(
                {
                    "kind": "FREE",
                    "intent": "OOC",
                    "description": "Explicar o teste",
                    "target": None,
                    "tool": {"type": "QUERY", "subject": "RULES"},
                }
            )

    result = asyncio.run(
        run_turn(
            request(mode="OUT_OF_CHARACTER", context={"freeActions": True}),
            Interpreter(),
        )
    )
    assert result.proposal.kind == "FREE"
    assert len(calls) == 1


def test_free_turn_exposes_only_named_free_action_schema_to_the_model():
    class Provider:
        async def generate_structured(self, prompt, schema, **kwargs):
            assert schema is FreeAction
            return schema.model_validate(
                {
                    "kind": "FREE",
                    "intent": "ARCANA",
                    "description": "Erguer Escudo",
                    "target": None,
                    "tool": {
                        "type": "ARCANA",
                        "arcanum": "psychic-shield",
                        "raised": True,
                    },
                }
            )

    result = asyncio.run(
        run_turn(request(mode="ACT", context={"freeActions": True}), Provider())
    )
    assert result.proposal.kind == "FREE"


def test_exceptional_scene_does_not_block_an_unrelated_conversation():
    class Interpreter:
        async def generate_structured(self, prompt, schema, **kwargs):
            return schema.model_validate(
                {
                    "kind": "FREE",
                    "intent": "TALK",
                    "description": "Falar com Mira",
                    "target": {"type": "CHARACTER", "name": "Mira"},
                    "tool": {"type": "DIALOGUE"},
                }
            )

    result = asyncio.run(
        run_turn(
            request(context={"adventure": {"gm": {"localAdjudicationRequired": True}}}),
            Interpreter(),
        )
    )
    assert result.proposal.kind == "FREE"


@pytest.mark.parametrize(
    "authorized,free,code",
    [
        (False, True, "LIVE_AUTHORIZATION_REQUIRED"),
        (True, False, "FREE_TIER_NOT_CONFIRMED"),
    ],
)
def test_phase54_probe_cannot_call_provider_without_both_gates(
    monkeypatch, authorized, free, code
):
    def forbidden(*args, **kwargs):
        raise AssertionError("SDK must not be constructed")

    monkeypatch.setattr("app.evaluation.autonomous.ProviderRouter", forbidden)
    with pytest.raises(ProviderError, match=code):
        asyncio.run(
            validate(
                Settings(_env_file=None, ai_free_tier_confirmed=free),
                authorized=authorized,
                case="dialogue",
                max_requests=2,
            )
        )


def test_phase54_probe_stops_after_one_ambiguous_interpretation(monkeypatch):
    class Adapter:
        def __init__(self, settings, max_requests):
            assert not settings.enable_provider_fallback
            assert max_requests == 2
            self.usage = []
            self.calls = 0

        async def generate_structured(self, prompt, schema, **kwargs):
            self.calls += 1
            assert self.calls == 1
            return schema.model_validate(
                {
                    "kind": "FREE",
                    "intent": "ARCANA",
                    "description": "Arcano não especificado",
                    "target": None,
                    "tool": {"type": "CLARIFY", "question": "Qual arcano?"},
                }
            )

    monkeypatch.setattr("app.evaluation.autonomous.ProviderRouter", Adapter)
    result = asyncio.run(
        validate(
            Settings(_env_file=None, ai_free_tier_confirmed=True),
            authorized=True,
            case="ambiguous",
            max_requests=2,
        )
    )
    assert result["interpretationPassed"]
    assert result["campaignWrites"] is False
    assert "draft" not in result


@pytest.mark.parametrize(
    "case,intent,tool",
    [
        ("dialogue", "TALK", {"type": "DIALOGUE"}),
        (
            "investigation",
            "INVESTIGATE",
            {"type": "PREPARED_CHECK", "capability": "Examinar a porta"},
        ),
        (
            "tool",
            "ARCANA",
            {"type": "ARCANA", "arcanum": "psychic-shield", "raised": True},
        ),
        ("ooc", "OOC", {"type": "QUERY", "subject": "RULES"}),
        ("continuity", "TALK", {"type": "DIALOGUE"}),
    ],
)
def test_live_case_plan_uses_at_most_two_calls_and_marks_outcomes_as_synthetic(
    monkeypatch, case, intent, tool
):
    class Adapter:
        def __init__(self, settings, max_requests):
            self.usage = []
            self.calls = 0

        async def generate_structured(self, prompt, schema, **kwargs):
            self.calls += 1
            assert self.calls <= 2
            if self.calls == 1:
                return schema.model_validate(
                    {
                        "kind": "FREE",
                        "intent": intent,
                        "description": "Tentativa",
                        "target": None,
                        "tool": tool,
                    }
                )
            return schema.model_validate(
                {
                    "narrative": "Uma resposta de teste.",
                    "eventIds": [],
                    "beats": [
                        {
                            "kind": "QUESTION",
                            "speakerId": None,
                            "text": "Uma resposta de teste.",
                            "factIds": [],
                        }
                    ],
                }
            )

    monkeypatch.setattr("app.evaluation.autonomous.ProviderRouter", Adapter)
    result = asyncio.run(
        validate(
            Settings(_env_file=None, ai_free_tier_confirmed=True),
            authorized=True,
            case=case,
            max_requests=2,
        )
    )
    assert result["interpretationPassed"]
    assert result["engineOutcome"] == "SYNTHETIC_FIXTURE"
    if case == "ooc":
        assert result["draft"] == {**result["confirmed"], "beats": None}
    else:
        assert result["beatsAssembled"]


def test_live_probe_does_not_render_a_misclassified_action(monkeypatch):
    class Adapter:
        def __init__(self, settings, max_requests):
            self.usage = []

        async def generate_structured(self, prompt, schema, **kwargs):
            return schema.model_validate(
                {
                    "kind": "FREE",
                    "intent": "OBSERVE",
                    "description": "Observar sem conversar",
                    "target": None,
                    "tool": {"type": "OBSERVE"},
                }
            )

    monkeypatch.setattr("app.evaluation.autonomous.ProviderRouter", Adapter)
    result = asyncio.run(
        validate(
            Settings(_env_file=None, ai_free_tier_confirmed=True),
            authorized=True,
            case="dialogue",
            max_requests=2,
        )
    )
    assert not result["interpretationPassed"]
    assert "draft" not in result


def test_render_only_recovery_does_not_repeat_interpretation(monkeypatch):
    class Adapter:
        def __init__(self, settings, max_requests):
            assert max_requests == 1
            self.usage = []

        async def generate_structured(self, prompt, schema, **kwargs):
            assert schema is Narration
            return schema.model_validate({"narrative": "Mira hesita.", "eventIds": []})

    monkeypatch.setattr("app.evaluation.autonomous.ProviderRouter", Adapter)
    result = asyncio.run(
        validate(
            Settings(_env_file=None, ai_free_tier_confirmed=True),
            authorized=True,
            case="dialogue",
            max_requests=1,
            render_only=True,
        )
    )
    assert result["interpretationSkipped"]
    assert "interpretationPassed" not in result
    assert result["draft"]["narrative"] == "Mira hesita."


def test_invalid_free_interpretation_asks_safely_without_a_repair_call():
    calls = []

    class InvalidProvider:
        async def generate_structured(self, *args, **kwargs):
            calls.append(1)
            raise ProviderError("INVALID_RESPONSE")

    result = asyncio.run(
        run_turn(request(context={"freeActions": True}), InvalidProvider())
    )
    assert result.proposal.root.tool.type == "CLARIFY"
    assert result.proposal.root.target is None
    assert len(calls) == 1


def test_invalid_literary_output_uses_confirmed_result_without_another_call():
    class InvalidProvider:
        async def generate_structured(self, *args, **kwargs):
            raise ProviderError("INVALID_RESPONSE")

    confirmed = Narration(narrative="O teste falhou.", eventIds=[])
    result = asyncio.run(
        run_turn(
            request(
                "NARRATE",
                context={"rendering": {"category": "MECHANIC"}},
                confirmed=confirmed,
            ),
            InvalidProvider(),
        )
    )
    assert result.narration == confirmed


@pytest.mark.parametrize("code", ["RATE_LIMIT", "TIMEOUT", "CONNECTION"])
def test_transient_failures_are_still_recoverable_not_fabricated_answers(code):
    class FailedProvider:
        async def generate_structured(self, *args, **kwargs):
            raise ProviderError(code)

    with pytest.raises(ProviderError, match=code):
        asyncio.run(run_turn(request(context={"freeActions": True}), FailedProvider()))
