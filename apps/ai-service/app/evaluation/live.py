"""Explicitly authorized, bounded Gemini probe. Never writes campaign state."""

import argparse
import asyncio
import json
from typing import Any

from pydantic import Field

from app.core.config import Settings, get_settings
from app.narrative.schemas import Narration, StrictModel
from app.providers.errors import ProviderError
from app.providers.router import ProviderRouter


class ConnectionProbe(StrictModel):
    answer: str = Field(min_length=1, max_length=200)


SMOKE = (
    "Responda em português brasileiro, no campo answer: "
    '"Mestre de RPG conectado com sucesso."'
)
NARRATIVE = """Avaliação isolada, sem publicação no jogo.
Retorne narrative e eventIds=[].
Cena sintética: Naelis e Theron estão num jardim ao entardecer. Há cheiro de chuva,
um banco de pedra e uma janela fechada. Nenhuma pista ou ameaça foi confirmada.
Theron é cauteloso, leal e reservado; lembra uma discussão anterior com Naelis.
Ele ouviu apenas um RUMOR de que a janela estaria danificada; não tem certeza.
Modo SPEAK, fala da jogadora:
"Theron, você realmente acredita que podemos confiar nele?"
Escreva até 100 palavras em português brasileiro, fantasia romântica e mistério.
Interprete Theron com cautela e nuances. Não invente quem é "ele" ou seus atos;
admita a incerteza. Não controle ações, pensamentos, emoções ou falas de Naelis.
Não avance de cena, revele segredos ou invente resultados mecânicos.
Este texto é um rascunho para revisão humana; não é um evento confirmado.
"""


async def validate(
    settings: Settings, *, authorized: bool, max_requests: int
) -> dict[str, Any]:
    if not authorized:
        raise ProviderError("LIVE_AUTHORIZATION_REQUIRED")
    if not settings.ai_free_tier_confirmed:
        raise ProviderError("FREE_TIER_NOT_CONFIRMED")
    if settings.llm_provider != "gemini":
        raise ProviderError("GEMINI_REQUIRED")
    if max_requests not in (1, 2):
        raise ProviderError("REQUEST_BUDGET")
    # One smoke, optionally one literary draft. No retries, fallback or repair loop.
    provider = ProviderRouter(
        settings.model_copy(update={"enable_provider_fallback": False}),
        max_requests=max_requests,
    )
    report: dict[str, Any] = {
        "provider": "gemini",
        "model": settings.gemini_model,
        "freeTierConfirmedByOperator": True,
        "maxRequests": max_requests,
        "campaignWrites": False,
        "results": [],
    }
    try:
        probe = await provider.generate_structured(
            SMOKE, ConnectionProbe, max_output_tokens=96
        )
        connected = probe.answer.strip() == "Mestre de RPG conectado com sucesso."
        report["results"].append(
            {"case": "smoke", "passed": connected, "response": probe.answer}
        )
        if connected and max_requests == 2:
            draft = await provider.generate_structured(
                NARRATIVE, Narration, max_output_tokens=350
            )
            report["results"].append(
                {
                    "case": "narrative",
                    "draft": draft.narrative,
                    "referencesValid": not draft.eventIds,
                    "humanReviewRequired": True,
                }
            )
    except ProviderError as exc:
        report["error"] = exc.code
    report["usage"] = [u.model_dump() for u in provider.usage]
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--authorize-live", action="store_true")
    parser.add_argument("--max-requests", type=int, choices=[1, 2], default=1)
    args = parser.parse_args()
    try:
        result = asyncio.run(
            validate(
                get_settings(),
                authorized=args.authorize_live,
                max_requests=args.max_requests,
            )
        )
    except ProviderError as exc:
        result = {"error": exc.code, "requests": 0}
    except Exception:
        # SDK/configuration exceptions may contain credentials; never print them.
        result = {"error": "VALIDATION_FAILED"}
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result.get("error") or any(
        r.get("passed") is False for r in result.get("results", [])
    ):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
