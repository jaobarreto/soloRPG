"""Phase 5.6.1 orchestration of the production graph, adapter and offline policy.

Default prints the frozen plan. --offline exercises fixtures without an SDK.
Live execution requires explicit authorization, process-only free-tier confirmation
and operator confirmation of the active key. An existing output is never reused.
"""

import argparse
import asyncio
import hashlib
import json
import subprocess
from pathlib import Path
from typing import Any
from unittest.mock import patch

from app.core.config import Settings, get_settings
from app.evaluation.replay import ScriptedProvider
from app.narrative.graph import run_turn
from app.narrative.schemas import TurnRequest
from app.providers.errors import ProviderError
from app.providers.gemini import GeminiProvider
from app.providers.router import ProviderRouter

ROOT = Path(__file__).resolve().parents[4]
PLAN = ROOT / "docs/ai/phase-5.6.1-plan.json"
MODEL = "gemini-3.5-flash-lite"
FROZEN = [
    ".env",
    "apps/ai-service/app/core/config.py",
    "apps/ai-service/app/narrative/graph.py",
    "apps/ai-service/app/narrative/prompts.py",
    "apps/ai-service/app/narrative/selection.py",
    "apps/ai-service/app/narrative/schemas.py",
    "apps/ai-service/app/providers/gemini.py",
    "apps/ai-service/app/providers/router.py",
    "apps/api/src/narrative/free-action.ts",
    "apps/api/src/narrative/information.ts",
    "apps/api/src/narrative/rendering.ts",
    "packages/shared-contracts/src/free-action.ts",
    "docs/ai/phase-5.6.1-plan.json",
]


def fingerprints() -> dict[str, str]:
    return {
        p: hashlib.sha256((ROOT / p).read_bytes()).hexdigest()
        for p in FROZEN
        if (ROOT / p).is_file()
    }


def preflight(
    settings: Settings, authorized: bool, key_confirmed: bool, max_requests: int
) -> None:
    for valid, code in [
        (authorized, "LIVE_AUTHORIZATION_REQUIRED"),
        (key_confirmed, "ACTIVE_KEY_PROJECT_CONFIRMATION_REQUIRED"),
        (settings.ai_free_tier_confirmed, "FREE_TIER_NOT_CONFIRMED"),
        (settings.llm_provider == "gemini", "GEMINI_REQUIRED"),
        (settings.gemini_model == MODEL, "UNEXPECTED_MODEL"),
        (not settings.enable_provider_fallback, "FALLBACK_MUST_BE_DISABLED"),
        (bool(settings.gemini_api_key), "NOT_CONFIGURED"),
        (1 <= max_requests <= 8, "REQUEST_BUDGET"),
    ]:
        if not valid:
            raise ProviderError(code)


def replay(request: TurnRequest, proposal: dict[str, Any]) -> dict[str, Any]:
    result = subprocess.run(
        ["node", str(ROOT / "scripts/replay-selection.mjs")],
        input=json.dumps(
            {"request": request.model_dump(mode="json"), "proposal": proposal}
        ),
        capture_output=True,
        text=True,
        timeout=15,
        check=True,
        cwd=ROOT,
    )
    return dict(json.loads(result.stdout))


def grade(case: dict[str, Any], proposal: dict[str, Any]) -> dict[str, Any]:
    expected = case["expected"]
    tool = proposal.get("tool", {})
    failures = []
    if proposal.get("intent") not in expected["intents"]:
        failures.append("INTENT")
    if tool.get("type") not in expected["tools"]:
        failures.append("TOOL")
    if proposal.get("expression") != expected["expression"]:
        failures.append("EXPRESSION")
    for name, value in expected.get("toolFields", {}).items():
        if tool.get(name) != value:
            failures.append("TOOL_PARAMETER:" + name)
    evidence = set(proposal.get("evidence") or [])
    required = set(expected["evidence"])
    allowed = required | set(expected.get("allowedAdditionalEvidence", []))
    if not required <= evidence or not evidence <= allowed:
        failures.append("EVIDENCE")
    for name in expected.get("forbiddenToolFields", []):
        if tool.get(name) is not None:
            failures.append("INVENTED_PARAMETER:" + name)
    if case["id"] == "561-07" and proposal.get("target") is not None:
        failures.append("ARBITRARY_TARGET")
    return {"passed": not failures, "failures": failures}


async def evaluate(
    settings: Settings,
    output: Path,
    *,
    authorized: bool = False,
    key_confirmed: bool = False,
    max_requests: int = 8,
    offline: bool = False,
    case_ids: list[str] | None = None,
) -> dict[str, Any]:
    if not offline:
        preflight(settings, authorized, key_confirmed, max_requests)
    if not 1 <= max_requests <= 8:
        raise ProviderError("REQUEST_BUDGET")
    plan = json.loads(PLAN.read_text())
    index = {case["id"]: case for case in plan["cases"]}
    if case_ids is not None and (
        not case_ids
        or len(case_ids) > max_requests
        or len(set(case_ids)) != len(case_ids)
        or any(case_id not in index for case_id in case_ids)
    ):
        raise ProviderError("CASE_SELECTION")
    selected_cases = (
        [index[case_id] for case_id in case_ids]
        if case_ids is not None
        else plan["cases"][:max_requests]
    )
    report: dict[str, Any] = {
        "phase": "5.6.1",
        "provider": "gemini",
        "model": MODEL,
        "evidenceKind": "SCRIPTED_OFFLINE"
        if offline
        else "REAL_MODEL_SYNTHETIC_CONTEXT",
        "operatorConfirmedActiveKeyFreeProjectWithoutBilling": key_confirmed,
        "projectId": None,
        "projectVerification": "OPERATOR_ATTESTATION",
        "maxRequests": max_requests,
        "maxOutputTokensPerRequest": 700,
        "selectedCaseIds": [case["id"] for case in selected_cases],
        "attempts": 0,
        "campaignWrites": False,
        "rows": [],
        "fingerprintsBefore": fingerprints(),
    }
    # Exclusive creation is a persistent guard against accidentally rerunning a batch.
    with output.open("x") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)

    def checkpoint() -> None:
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")

    for case in selected_cases:
        request = TurnRequest.model_validate(case["request"])
        row: dict[str, Any] = {
            "id": case["id"],
            "request": case["request"],
            "expected": case["expected"],
            "rawResponse": None,
        }
        report["rows"].append(row)
        if not offline:
            # Reserve before SDK invocation. Any failure consumes the reservation.
            report["attempts"] += 1
        checkpoint()

        class ObservedGemini(GeminiProvider):
            def __init__(
                self, *args: Any, captured: dict[str, Any] = row, **kwargs: Any
            ):
                super().__init__(*args, **kwargs)
                original = self.client.aio.models.generate_content

                async def observed(*a: Any, **kw: Any) -> Any:
                    result = await original(*a, **kw)
                    captured["rawResponse"] = result.text
                    captured["reportedModelVersion"] = result.model_version
                    return result

                # Observation only: arguments, response and validation are unchanged.
                self.client.aio.models.generate_content = observed  # type: ignore[method-assign]

        router = None if offline else ProviderRouter(settings, max_requests=1)
        provider = (
            ScriptedProvider(case["offlineProposal"]) if router is None else router
        )
        try:
            with patch("app.providers.router.GeminiProvider", ObservedGemini):
                response = await run_turn(request, provider)
            usage = [] if router is None else [u.model_dump() for u in router.usage]
            invalid = any(u.get("error") == "INVALID_RESPONSE" for u in usage)
            if response.proposal is None:
                raise ProviderError("INVALID_RESPONSE")
            row["proposal"] = response.proposal.model_dump(mode="json")
            # A graph fallback is never graded as the model's selected proposal.
            row["schemaValid"] = not invalid
            row["fallback"] = invalid
            if not invalid:
                row["semantic"] = grade(case, row["proposal"])
                # Validate the original SDK JSON, without Pydantic serialization.
                row["nestJS"] = replay(
                    request,
                    json.loads(row["rawResponse"])
                    if row["rawResponse"] is not None
                    else row["proposal"],
                )
                if not row["nestJS"].get("schemaValid"):
                    row["error"] = "NESTJS_INVALID_SCHEMA"
                elif row["nestJS"].get("effectsExecuted"):
                    row["error"] = "UNEXPECTED_EFFECT_EXECUTION"
            else:
                row["error"] = "INVALID_RESPONSE"
                try:
                    row["nestJS"] = replay(request, json.loads(row["rawResponse"]))
                except (TypeError, ValueError):
                    row["nestJS"] = {"authorization": "NOT_EVALUABLE"}
            version = row.get("reportedModelVersion")
            if not offline and version is not None and version != MODEL:
                row["error"] = "UNEXPECTED_MODEL"
        except ProviderError as exc:
            row["error"] = exc.code
        except Exception:
            # Never expose SDK exceptions, auth material or arbitrary stderr.
            row["error"] = "EVALUATION_OR_REPLAY_ERROR"
        if router is not None:
            row["usage"] = [
                {
                    **u.model_dump(),
                    **(
                        {"inputTokens": None, "outputTokens": None, "totalTokens": None}
                        if not u.usageReported
                        else {}
                    ),
                }
                for u in router.usage
            ]
            row["validationIssues"] = router.validation_issues
        else:
            row["usage"] = []
        checkpoint()
        if row.get("error") or row.get("fallback"):
            report["stopReason"] = row.get("error") or "INVALID_RESPONSE"
            break
        # Keep the established probe's conservative stop on unexpected mechanics.
        if (
            row["proposal"]["tool"]["type"]
            in {"ARCANA", "PREPARED_CHECK", "COMBAT", "REST", "WAIT"}
            and row["proposal"]["tool"]["type"] not in case["expected"]["tools"]
        ):
            report["stopReason"] = "UNEXPECTED_MECHANICAL_TOOL"
            break
    report["fingerprintsAfter"] = fingerprints()
    report["frozenInputsPreserved"] = (
        report["fingerprintsBefore"] == report["fingerprintsAfter"]
    )
    checkpoint()
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--authorize-live", action="store_true")
    parser.add_argument("--operator-key-confirmed", action="store_true")
    parser.add_argument("--offline", action="store_true")
    parser.add_argument("--max-requests", type=int, default=8)
    parser.add_argument("--case-ids", nargs="+")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not args.authorize_live and not args.offline:
        print(PLAN.read_text())
        return
    if not args.output:
        parser.error("--output is required for evaluation")
    if args.offline and args.authorize_live:
        parser.error("--offline and --authorize-live are exclusive")
    result = asyncio.run(
        evaluate(
            get_settings(),
            args.output,
            authorized=args.authorize_live,
            key_confirmed=args.operator_key_confirmed,
            max_requests=args.max_requests,
            offline=args.offline,
            case_ids=args.case_ids,
        )
    )
    print(
        json.dumps(
            {
                "attempts": result["attempts"],
                "rows": len(result["rows"]),
                "stopReason": result.get("stopReason"),
                "frozenInputsPreserved": result["frozenInputsPreserved"],
            }
        )
    )


if __name__ == "__main__":
    main()
