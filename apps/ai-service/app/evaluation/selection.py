"""Phase 5.6 selection probe. Default is an offline plan, never a live call.

Uses production graph/router with synthetic public scenes. No campaign writes.
Model accuracy and NestJS authorization are reported as separate measurements.
"""

import argparse
import asyncio
import json
from pathlib import Path
from typing import Any
from uuid import uuid4

from app.core.config import Settings, get_settings
from app.narrative.graph import run_turn
from app.narrative.schemas import TurnRequest
from app.providers.errors import ProviderError
from app.providers.router import ProviderRouter

MATRIX = (
    Path(__file__).resolve().parents[4]
    / "packages/shared-contracts/fixtures/phase56-semantic.json"
)
LIVE_CASES = [
    "56-063",
    "56-062",
    "56-064",
    "56-065",
    "56-022",
    "56-024",
    "56-049",
    "56-021",
]


def cases() -> list[dict[str, Any]]:
    data = json.loads(MATRIX.read_text())
    return [
        {
            **row,
            "context": {**data["baseContext"], **data["contexts"][row["contextKey"]]},
        }
        for row in data["cases"]
    ]


def plan() -> dict[str, Any]:
    index = {c["id"]: c for c in cases()}
    return {
        "phase": "5.6",
        "liveExecuted": False,
        "maxRequests": 8,
        "maxOutputTokensPerRequest": 700,
        "maxOutputTokensTotal": 5600,
        "stages": ["PROPOSE"],
        "campaignWrites": False,
        "providerConfigurationChanges": False,
        "cases": [
            {
                k: index[i].get(k)
                for k in (
                    "id",
                    "message",
                    "contextState",
                    "expectedIntent",
                    "expectedTool",
                )
            }
            for i in LIVE_CASES
        ],
        "stopOn": [
            "provider error",
            "invalid contract/fallback",
            "unexpected mechanical tool",
        ],
        "purpose": (
            "Reavaliar investigação, Arcana, ambiguidade e fontes OOC "
            "com contrastes de contexto."
        ),
        "recording": (
            "JSON: casos sintéticos, propostas, tokens, latência, erros, "
            "matriz de confusão; autorização NestJS separada."
        ),
    }


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    tools: dict[str, dict[str, int]] = {}
    confusion: dict[str, dict[str, int]] = {}
    authorization_confusion: dict[str, dict[str, int]] = {}
    for row in rows:
        expected, selected = row["expectedTool"], row.get("selectedTool", "INVALID")
        confusion.setdefault(expected, {})[selected] = (
            confusion.setdefault(expected, {}).get(selected, 0) + 1
        )
        authorized = row.get("authorizedTool") or "NOT_EVALUATED"
        counts = authorization_confusion.setdefault(expected, {})
        counts[authorized] = counts.get(authorized, 0) + 1
        for tool in {expected, selected}:
            stats = tools.setdefault(
                tool, {"truePositive": 0, "falsePositive": 0, "falseNegative": 0}
            )
            if expected == selected == tool:
                stats["truePositive"] += 1
            elif tool == selected:
                stats["falsePositive"] += 1
            else:
                stats["falseNegative"] += 1
    return {
        "count": len(rows),
        "confusion": confusion,
        "authorizationConfusion": authorization_confusion,
        "tools": tools,
        "selectionErrors": sum(
            r.get("selectedTool") != r["expectedTool"] for r in rows
        ),
        "intentErrors": sum(
            r.get("selectedIntent") != r.get("expectedIntent") for r in rows
        ),
        "contractErrors": sum(bool(r.get("contractError")) for r in rows),
        "contextErrors": sum(bool(r.get("contextError")) for r in rows),
        "fallbacks": sum(bool(r.get("fallback")) for r in rows),
        "injectedSelectionErrors": sum(bool(r.get("injectedMismatch")) for r in rows),
        "clarifications": sum(r.get("selectedTool") == "CLARIFY" for r in rows),
        "preventedExecution": sum(bool(r.get("preventedExecution")) for r in rows),
        "preventedDiscovery": sum(bool(r.get("preventedDiscovery")) for r in rows),
        "unauditedAuthorization": sum(r.get("authorizedTool") is None for r in rows),
    }


async def evaluate(
    settings: Settings, *, authorized: bool, max_requests: int = 8
) -> dict[str, Any]:
    if not authorized:
        raise ProviderError("LIVE_AUTHORIZATION_REQUIRED")
    if not settings.ai_free_tier_confirmed:
        raise ProviderError("FREE_TIER_NOT_CONFIRMED")
    if settings.llm_provider != "gemini":
        raise ProviderError("GEMINI_REQUIRED")
    if settings.enable_provider_fallback:
        raise ProviderError("FALLBACK_MUST_BE_DISABLED")
    if not 1 <= max_requests <= 8:
        raise ProviderError("REQUEST_BUDGET")
    index = {c["id"]: c for c in cases()}
    rows: list[dict[str, Any]] = []
    requests = 0
    for case_id in LIVE_CASES[:max_requests]:
        case = index[case_id]
        # A one-call router preserves the existing per-turn financial cap.
        provider = ProviderRouter(settings, max_requests=1)
        row: dict[str, Any] = {
            "id": case_id,
            "expectedIntent": case["expectedIntent"],
            "expectedTool": case["expectedTool"],
            "authorizedTool": None,
            "contextError": None,
            "preventedExecution": None,
            "preventedDiscovery": None,
        }
        try:
            response = await run_turn(
                TurnRequest(
                    actionId=uuid4(),
                    campaignId=uuid4(),
                    sessionId=uuid4(),
                    stage="PROPOSE",
                    interactionMode=case["mode"],
                    playerMessage=case["message"],
                    context=case["context"],
                    confirmed=None,
                ),
                provider,
            )
            proposal = response.proposal.root if response.proposal else None
            payload = proposal.model_dump(mode="json") if proposal else {}
            row.update(
                {
                    "proposal": payload,
                    "selectedIntent": payload.get("intent"),
                    "selectedTool": payload.get("tool", {}).get("type", "INVALID"),
                }
            )
            row["expectedExpression"] = case["proposal"]["expression"]
            row["selectedExpression"] = payload.get("expression")
            row["expectedEvidence"] = case["proposal"]["evidence"]
            row["selectedEvidence"] = payload.get("evidence") or []
            row["contextError"] = set(row["expectedEvidence"]) != set(
                row["selectedEvidence"]
            )
            if row["selectedTool"] == "PREPARED_CHECK":
                row["contextError"] = row["contextError"] or payload["tool"].get(
                    "capability"
                ) != case["proposal"]["tool"].get("capability")
            row["interpretationPassed"] = (
                row["selectedTool"] == row["expectedTool"]
                and row["selectedIntent"] == row["expectedIntent"]
                and row["selectedExpression"] == row["expectedExpression"]
                and not row["contextError"]
            )
            row["contractError"] = any(
                u.error == "INVALID_RESPONSE" for u in provider.usage
            )
            row["fallback"] = row["contractError"]
        except ProviderError as exc:
            row.update({"error": exc.code, "selectedTool": "INVALID"})
        row["usage"] = [u.model_dump() for u in provider.usage]
        row["validationIssues"] = provider.validation_issues
        requests += len(provider.usage)
        rows.append(row)
        if (
            row.get("error")
            or row.get("fallback")
            or (
                row["selectedTool"]
                in {"ARCANA", "PREPARED_CHECK", "COMBAT", "REST", "WAIT"}
                and row["selectedTool"] != row["expectedTool"]
            )
        ):
            break
    return {
        "phase": "5.6",
        "evidenceKind": "REAL_MODEL_SYNTHETIC_CONTEXT",
        "model": settings.gemini_model,
        "requests": requests,
        "maxRequests": max_requests,
        "campaignWrites": False,
        "authorizationEvaluated": False,
        "rows": rows,
        "summary": summarize(rows),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--authorize-live", action="store_true")
    parser.add_argument("--max-requests", type=int, default=8)
    parser.add_argument("--summarize", type=Path)
    args = parser.parse_args()
    if args.summarize:
        data = json.loads(args.summarize.read_text())
        report = {
            "evidenceKind": data["evidenceKind"],
            "summary": summarize(data["rows"]),
        }
    elif not args.authorize_live:
        report = plan()
    else:
        try:
            report = asyncio.run(
                evaluate(
                    get_settings(), authorized=True, max_requests=args.max_requests
                )
            )
        except ProviderError as exc:
            report = {"error": exc.code, "requests": 0}
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if args.authorize_live and (
        report.get("error")
        or any(not row.get("interpretationPassed") for row in report.get("rows", []))
    ):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
