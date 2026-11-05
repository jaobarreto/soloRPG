"""Offline publication protocol: Pydantic is structural; Nest owns the strings."""

import asyncio
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.narrative.graph import run_turn
from app.narrative.prompts import NARRATOR
from app.narrative.schemas import Narration, TurnRequest


def test_production_narrator_selects_whole_authorized_beats():
    assert "rendering.publication.choices" in NARRATOR
    assert "sem modificar" in NARRATOR
    speaker = str(uuid4())
    beat = {
        "kind": "DIALOGUE",
        "speakerId": speaker,
        "text": "Mira — Prefiro cautela. O que despertou sua suspeita?",
        "factIds": [],
    }
    calls = []

    class Scripted:
        async def generate_structured(self, prompt, schema, **kwargs):
            calls.append(prompt)
            assert schema is Narration
            assert "publication" in prompt and beat["text"] in prompt
            return schema.model_validate(
                {"narrative": beat["text"], "eventIds": [], "beats": [beat]}
            )

    request = TurnRequest(
        actionId=uuid4(),
        campaignId=uuid4(),
        sessionId=uuid4(),
        stage="NARRATE",
        interactionMode="SPEAK",
        playerMessage="Mira, podemos conversar?",
        context={
            "rendering": {
                "category": "DIALOGUE",
                "publication": {"version": 1, "choices": [beat]},
            }
        },
        confirmed=Narration(narrative="Mira ouviu a pergunta.", eventIds=[]),
    )
    result = asyncio.run(run_turn(request, Scripted()))
    assert result.narration.beats[0].model_dump(mode="json") == beat
    assert len(calls) == 1


@pytest.mark.parametrize(
    "kind", ["RESULT", "ATMOSPHERE", "DIALOGUE", "QUESTION", "OOC"]
)
def test_existing_beat_contract_remains_strict_and_compatible(kind):
    data = {
        "narrative": "Texto autorizado.",
        "eventIds": [],
        "beats": [
            {
                "kind": kind,
                "speakerId": None,
                "text": "Texto autorizado.",
                "factIds": [],
            }
        ],
    }
    assert Narration.model_validate(data).model_dump(mode="json") == data
    data["beats"][0]["inventedAuthority"] = True
    with pytest.raises(ValidationError):
        Narration.model_validate(data)
