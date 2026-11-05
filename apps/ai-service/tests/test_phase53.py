import asyncio
from uuid import uuid4

import pytest

from app.narrative.graph import run_turn
from app.narrative.schemas import Narration, TurnRequest


def request(mode="ACT", content="Examino a parede.", **kwargs):
    return TurnRequest(
        actionId=uuid4(),
        campaignId=uuid4(),
        sessionId=uuid4(),
        stage="PROPOSE",
        interactionMode=mode,
        playerMessage=content,
        context={},
        confirmed=None,
    ).model_copy(update=kwargs)


class ForbiddenProvider:
    async def generate_structured(self, *args, **kwargs):
        raise AssertionError("No external call is needed for a confirmed projection")


def test_confirmed_narration_does_not_spend_quota_to_copy_text():
    confirmed = Narration(narrative="A passagem está aberta.", eventIds=[uuid4()])
    result = asyncio.run(
        run_turn(request(stage="NARRATE", confirmed=confirmed), ForbiddenProvider())
    )
    assert result.narration == confirmed


@pytest.mark.parametrize(
    "mode,content",
    [
        ("SPEAK", "Theron, você realmente acredita que podemos confiar nele?"),
        ("ACT", "Examino as paredes procurando alguma passagem escondida."),
        ("THINK", "Naelis suspeita que exista algo errado com aquela história."),
        ("OUT_OF_CHARACTER", "Mestre, como funciona esse teste em Blue Rose?"),
        ("ACT", "Converso com o jardineiro sobre sua família."),
        ("ACT", "Investigo a colher esquecida no chão."),
        ("ACT", "Volto à localização anterior."),
        ("SPEAK", "Não aceito essa missão."),
        ("SPEAK", "Podemos resolver esse conflito sem lutar?"),
        ("SPEAK", "Qual é a história desse retrato?"),
        ("ACT", "Deixo a investigação para depois e observo o jardim."),
    ],
)
def test_free_messages_preserve_mode_and_never_improvise_mechanical_effects(
    mode, content
):
    calls = []

    class PreparedProvider:
        async def generate_structured(self, prompt, schema, **kwargs):
            calls.append(prompt)
            assert content in prompt
            assert mode in prompt
            return schema.model_validate({"kind": "OBSERVE"})

    result = asyncio.run(run_turn(request(mode, content), PreparedProvider()))
    assert result.proposal.kind == "OBSERVE"
    assert len(calls) == (0 if mode in ("THINK", "OUT_OF_CHARACTER") else 1)
