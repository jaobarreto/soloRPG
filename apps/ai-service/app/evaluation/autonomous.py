"""One synthetic Phase 5.4 case, explicitly authorized and capped at two calls.

Uses the production graph/provider. Does not access a database or publish prose.
Engine outcomes are fixtures, not evidence of live mechanical execution.
"""

import argparse
import asyncio
import json
from typing import Any
from uuid import UUID

from app.core.config import Settings, get_settings
from app.narrative.graph import run_turn
from app.narrative.schemas import FreeAction, Narration, TurnRequest
from app.providers.errors import ProviderError
from app.providers.router import ProviderRouter

PC = UUID("d8731260-21a1-4e9a-9d3f-89720e7f9fa1")
MIRA = UUID("8a4d09c1-98ef-4d9c-a22a-e4fa7db6278c")
EVENT = UUID("f5f50b8e-506f-4239-af7d-a6a76753c72e")
CASES = {
    "dialogue": (
        "SPEAK",
        "Mira, você acha que podemos confiar em Aren?",
        "TALK",
        "DIALOGUE",
    ),
    "investigation": (
        "ACT",
        "Examino a porta procurando as inscrições ocultas.",
        "INVESTIGATE",
        "PREPARED_CHECK",
    ),
    "tool": ("ACT", "Ergo meu Escudo Psíquico.", "ARCANA", "ARCANA"),
    "ambiguous": ("ACT", "Quero usar minha magia nele.", "ARCANA", "CLARIFY"),
    "ooc": (
        "OUT_OF_CHARACTER",
        "Mestre, como funciona o Drama Die nesse teste?",
        "OOC",
        "QUERY",
    ),
    "continuity": (
        "SPEAK",
        "Mira, depois da nossa discussão, você ainda quer conversar comigo?",
        "TALK",
        "DIALOGUE",
    ),
}


async def validate(
    settings: Settings,
    *,
    authorized: bool,
    case: str,
    max_requests: int,
    render_only: bool = False,
) -> dict[str, Any]:
    if not authorized:
        raise ProviderError("LIVE_AUTHORIZATION_REQUIRED")
    if not settings.ai_free_tier_confirmed:
        raise ProviderError("FREE_TIER_NOT_CONFIRMED")
    if settings.llm_provider != "gemini":
        raise ProviderError("GEMINI_REQUIRED")
    if case not in CASES or max_requests not in (1, 2):
        raise ProviderError("REQUEST_BUDGET")
    provider = ProviderRouter(
        settings.model_copy(update={"enable_provider_fallback": False}),
        max_requests=max_requests,
    )
    mode, message, expected_intent, expected_tool = CASES[case]
    context = {
        "freeActions": True,
        "scene": "Um acampamento ao entardecer, junto a uma porta de pedra.",
        "characters": [
            {"id": str(PC), "name": "Naelis", "kind": "PROTAGONIST"},
            {"id": str(MIRA), "name": "Mira", "kind": "COMPANION"},
        ],
        "actors": [{"id": str(MIRA), "name": "Mira", "kind": "COMPANION"}],
        "world": [
            {
                "id": "39c38a61-29d9-44fe-a1a6-b82b7cb5e065",
                "name": "Porta",
                "status": "CLOSED",
                "description": "Uma porta de pedra.",
            }
        ],
        "combat": None,
        "options": [
            {
                "id": str(EVENT),
                "intent": "Examinar a porta",
                "mode": "ACT",
                "requiresCheck": True,
            }
        ],
    }
    request = TurnRequest.model_validate(
        {
            "actionId": str(PC),
            "campaignId": str(PC),
            "sessionId": str(PC),
            "stage": "PROPOSE",
            "interactionMode": mode,
            "playerMessage": message,
            "context": context,
            "confirmed": None,
        }
    )
    report: dict[str, Any] = {
        "case": case,
        "model": settings.gemini_model,
        "provider": "gemini",
        "maxRequests": max_requests,
        "campaignWrites": False,
        "engineOutcome": "SYNTHETIC_FIXTURE",
        "humanReviewRequired": True,
        "request": {
            "interactionMode": mode,
            "playerMessage": message,
            "context": context,
        },
        "rubric": [
            "coherence",
            "context",
            "agency",
            "personality",
            "literaryQuality",
            "mechanicalFidelity",
            "security",
            "latency",
        ],
    }
    try:
        if render_only:
            valid = True
            report["interpretationSkipped"] = True
        else:
            planned = await run_turn(request, provider)
            proposal = planned.proposal.root if planned.proposal else None
            valid = (
                isinstance(proposal, FreeAction)
                and proposal.intent == expected_intent
                and proposal.tool.type == expected_tool
            )
            report["interpretationPassed"] = valid
            report["proposal"] = proposal.model_dump(mode="json") if proposal else None
        if valid and (max_requests == 2 or render_only) and case != "ambiguous":
            category = (
                "MECHANIC"
                if case in ("investigation", "tool")
                else "OOC"
                if case == "ooc"
                else "DIALOGUE"
            )
            text = (
                "O teste falhou; nenhuma inscrição oculta foi descoberta."
                if case == "investigation"
                else "O Escudo Psíquico foi erguido."
                if case == "tool"
                else "Mira ouviu a pergunta."
                if category == "DIALOGUE"
                else "O Drama Die é o terceiro dado do teste básico de 3d6."
            )
            facts = (
                [
                    {
                        "eventId": str(EVENT),
                        "description": (
                            "Mira testemunhou uma discussão com Naelis "
                            "na sessão anterior."
                        ),
                        "source": "WITNESSED",
                    }
                ]
                if case == "continuity"
                else []
            )
            rendering = {
                "category": category,
                "protagonist": {"id": str(PC), "name": "Naelis"},
                "speaker": {
                    "id": str(MIRA),
                    "name": "Mira",
                    "personality": "Serena, reservada, cautelosa.",
                    "motivations": "Proteger seus companheiros.",
                }
                if category == "DIALOGUE"
                else None,
                "scene": context["scene"] if category != "OOC" else None,
                "facts": facts,
                "rules": [
                    {"description": "3d6 + habilidade + foco; terceiro dado Drama Die."}
                ]
                if category == "OOC"
                else [],
            }
            rendered = await run_turn(
                request.model_copy(
                    update={
                        "stage": "NARRATE",
                        "context": {"rendering": rendering},
                        "confirmed": Narration(narrative=text, eventIds=[]),
                    }
                ),
                provider,
            )
            report["renderingContext"] = rendering
            report["confirmed"] = {"narrative": text, "eventIds": []}
            draft = rendered.narration
            report["draft"] = draft.model_dump(mode="json") if draft else None
            report["referencesValid"] = bool(draft and not draft.eventIds)
            report["beatsAssembled"] = bool(
                draft
                and draft.beats
                and draft.narrative == "\n\n".join(b.text for b in draft.beats)
            )
    except ProviderError as exc:
        report["error"] = exc.code
    report["usage"] = [u.model_dump() for u in provider.usage]
    report["validationIssues"] = getattr(provider, "validation_issues", [])
    report["requests"] = len(provider.usage)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--authorize-live", action="store_true")
    parser.add_argument("--case", choices=list(CASES), required=True)
    parser.add_argument("--max-requests", type=int, choices=[1, 2], default=1)
    parser.add_argument("--render-only", action="store_true")
    args = parser.parse_args()
    try:
        report = asyncio.run(
            validate(
                get_settings(),
                authorized=args.authorize_live,
                case=args.case,
                max_requests=args.max_requests,
                render_only=args.render_only,
            )
        )
    except ProviderError as exc:
        report = {"error": exc.code, "requests": 0}
    except Exception:
        report = {"error": "VALIDATION_FAILED"}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report.get("error") or report.get("interpretationPassed") is False:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
