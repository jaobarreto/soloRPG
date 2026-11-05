"""One frozen PROPOSE-only experiment; no production or historical code changes."""

import argparse
import asyncio
import json
import os
import subprocess
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from app.core.config import Settings
from app.evaluation.literary_capture import MODEL, observe_sdk
from app.evaluation.literary_executor import (
    PLAN as HISTORICAL_PLAN,
)
from app.evaluation.literary_executor import (
    PLAN_SHA as HISTORICAL_SHA,
)
from app.evaluation.literary_executor import (
    ROOT,
    Budget,
    Halt,
    ReservedProvider,
    authorize,
    compare_selection,
    parse_original,
    sha,
)
from app.narrative.graph import run_turn
from app.narrative.schemas import SelectedFreeAction, TurnRequest
from app.providers.errors import ProviderError
from app.providers.router import ProviderRouter

PLAN = "docs/ai/phase-5.6.3c-1-semantic-propose-plan.json"
MANIFEST = "docs/ai/phase-5.6.3c-1-semantic-propose-manifest.json"
REPLAY = "scripts/evaluate-semantic-propose.mjs"
CASE_IDS = ("C1-2", "SP-2", "SP-3", "SP-4")
LIMITS = {
    "model": MODEL,
    "requests": 4,
    "stage": "PROPOSE",
    "outputTokensPerRequest": 700,
    "configuredOutputCeiling": 2800,
    "inputCharactersPerRequest": 65000,
    "retries": 0,
    "fallback": False,
    "repairs": 0,
    "campaignWrites": False,
    "stopAtFirstFailure": True,
}


def verify(root: Path, digest: str) -> dict[str, Any]:
    manifest = (root / MANIFEST).read_bytes()
    if sha(manifest) != digest:
        raise Halt("MANIFEST_MISMATCH")
    frozen = json.loads(manifest)
    for relative, expected in frozen["files"].items():
        path = (root / relative).resolve()
        if (
            not path.is_relative_to(root.resolve())
            or sha(path.read_bytes()) != expected
        ):
            raise Halt("FROZEN_FILE_DRIFT")
    plan_bytes = (root / PLAN).read_bytes()
    if sha(plan_bytes) != frozen["planSha256"]:
        raise Halt("PLAN_DRIFT")
    plan = json.loads(plan_bytes)
    historical = (root / HISTORICAL_PLAN).read_bytes()
    if sha(historical) != HISTORICAL_SHA:
        raise Halt("HISTORICAL_PLAN_DRIFT")
    baseline = json.loads(historical)["cases"][1]
    if (
        plan["roundId"] != frozen["roundId"]
        or plan["limits"] != LIMITS
        or tuple(c["caseId"] for c in plan["cases"]) != CASE_IDS
        or plan["cases"][0]["proposeRequest"] != baseline["proposeRequest"]
        or plan["cases"][0]["expectedProposal"] != baseline["expectedProposal"]
    ):
        raise Halt("ROUND_IDENTITY_DRIFT")
    for case in plan["cases"]:
        request = TurnRequest.model_validate(case["proposeRequest"])
        if (
            request.stage != "PROPOSE"
            or request.confirmed is not None
            or not request.context.get("freeActions")
            or not request.context.get("selection")
        ):
            raise Halt("UNSAFE_REQUEST")
        SelectedFreeAction.model_validate(case["expectedProposal"])
    return plan  # type: ignore[no-any-return]


class ProposeBudget(Budget):
    def __init__(self) -> None:
        super().__init__(maximum=4)

    def reserve(
        self, case: str, stage: str, characters: int, tokens: int
    ) -> dict[str, Any]:
        if stage != "PROPOSE" or tokens != 700 or not 0 < characters <= 65000:
            raise Halt("REQUEST_LIMIT")
        if len(self.used) >= len(CASE_IDS) or CASE_IDS[len(self.used)] != case:
            raise Halt("UNKNOWN_REPEATED_OR_OUT_OF_ORDER_SLOT")
        self.used.add((case, stage))
        return {
            "caseId": case,
            "stage": stage,
            "reserved": len(self.used),
            "configuredOutputCeilingReserved": 700 * len(self.used),
        }


def replay(root: Path, case: dict[str, Any], raw: str | None) -> dict[str, Any]:
    child = subprocess.run(
        ["node", str(root / REPLAY)],
        input=json.dumps({"rawText": raw, "request": case["proposeRequest"]}),
        text=True,
        capture_output=True,
        cwd=root,
        timeout=15,
    )
    if child.returncode:
        raise Halt("NESTJS_REPLAY_UNVERIFIABLE")
    return json.loads(child.stdout)  # type: ignore[no-any-return]


def resolution_matches(case: dict[str, Any], result: dict[str, Any]) -> bool:
    return (
        result["zod"]["valid"]
        and not result["wouldAuthorizeEffect"]
        and isinstance(result["resolution"], dict)
        and all(
            result["resolution"].get(k) == v
            for k, v in case["expectedResolution"].items()
        )
    )


def preflight(root: Path, digest: str) -> dict[str, Any]:
    plan = verify(root, digest)
    for case in plan["cases"]:
        result = replay(root, case, json.dumps(case["expectedProposal"]))
        if not resolution_matches(case, result):
            raise Halt("NESTJS_PREFLIGHT_FAILED")
    return plan


def normal_settings(settings: Settings) -> None:
    if settings.llm_provider != "gemini" or settings.gemini_model != MODEL:
        raise Halt("PROVIDER_MODEL_MISMATCH")
    if settings.enable_provider_fallback or settings.ai_free_tier_confirmed:
        raise Halt("UNSAFE_NORMAL_PROVIDER_SETTINGS")
    if not settings.gemini_api_key or not settings.gemini_api_key.get_secret_value():
        raise Halt("KEY_PROJECT_IDENTITY_UNVERIFIED")


async def run_round(
    root: Path,
    digest: str,
    round_id: str,
    *,
    settings: Settings,
    approval: dict[str, Any],
    transport: Callable[[httpx.Request], httpx.Response] | None = None,
    offline_directory: Path | None = None,
) -> dict[str, Any]:
    offline = offline_directory is not None
    if offline != (transport is not None):
        raise Halt("INVALID_TRANSPORT_MODE")
    normal_settings(settings)
    plan = preflight(root, digest)
    if plan["roundId"] != round_id:
        raise Halt("ROUND_ID_MISMATCH")
    if offline:
        if approval:
            raise Halt("OFFLINE_APPROVAL_FORBIDDEN")
        active = settings.model_copy(update={"ai_free_tier_confirmed": True})
        directory = offline_directory
    else:
        if approval.get("roundId") != round_id:
            raise Halt("NEW_ROUND_AUTHORIZATION_REQUIRED")
        active = authorize(settings, approval, manifest_digest=digest)
        directory = root / "docs/ai/phase-5.6.3c-1-semantic-propose-runs" / round_id
        ledger = root / ".tools/evaluation-rounds"
        ledger.mkdir(parents=True, exist_ok=True)
        with (ledger / round_id).open("x") as claim:
            claim.write(digest + "\n")
            claim.flush()
            os.fsync(claim.fileno())
    assert directory is not None
    directory.mkdir(mode=0o700, parents=True)
    budget = ProposeBudget()
    report: dict[str, Any] = {
        "roundId": round_id,
        "manifestSha256": digest,
        "mode": "OFFLINE" if offline else "AUTHORIZED_REAL_GEMINI",
        "createdAt": datetime.now(UTC).isoformat(),
        "limits": LIMITS,
        "attempts": [],
        "descriptionReview": "PENDING_HUMAN",
        "authorization": {
            "newRoundAuthorized": not offline,
            "freeProjectAttested": not offline,
            "billingDisabledAttested": not offline,
            "projectIndependentlyVerified": False,
        },
    }
    with (directory / "events.jsonl").open("x") as events:

        def log(kind: str, data: dict[str, Any]) -> None:
            events.write(
                json.dumps({"type": kind, "data": data}, ensure_ascii=False) + "\n"
            )
            events.flush()
            os.fsync(events.fileno())

        log("started", {k: v for k, v in report.items() if k != "attempts"})
        try:
            for case in plan["cases"]:
                verify(root, digest)
                request = TurnRequest.model_validate(case["proposeRequest"])
                receipt: dict[str, Any] = {
                    "caseId": case["caseId"],
                    "stage": "PROPOSE",
                    "requestedProvider": "gemini",
                    "requestedModel": MODEL,
                    "reportedModel": None,
                    "rawText": None,
                    "inputTokens": None,
                    "outputTokens": None,
                    "totalTokens": None,
                    "latencyMs": None,
                    "providerError": None,
                    "fallbackUsed": False,
                }
                report["attempts"].append(receipt)
                router = ProviderRouter(active, max_requests=1)
                provider = ReservedProvider(
                    router,
                    budget,
                    case["caseId"],
                    "PROPOSE",
                    lambda data: log("reserved", data),
                    receipt,
                )
                secrets = [
                    s.get_secret_value()
                    for s in (
                        active.gemini_api_key,
                        active.groq_api_key,
                        active.ai_internal_token,
                    )
                    if s is not None
                ]
                try:
                    with observe_sdk(receipt, secrets=secrets, transport=transport):
                        graph = await run_turn(request, provider)
                        receipt["graphResponse"] = graph.model_dump(mode="json")
                except ProviderError as exc:
                    receipt["providerError"] = exc.code
                finally:
                    receipt["providerError"] = next(
                        (u.error for u in router.usage if u.error),
                        receipt["providerError"],
                    )
                    log("raw-response", receipt)
                original = parse_original(receipt, "PROPOSE")
                result = receipt["nest"] = replay(root, case, receipt["rawText"])
                expected = case["expectedProposal"]
                if isinstance(original, dict) and original.get("intent") in case.get(
                    "alsoAcceptIntent", []
                ):
                    expected = {**expected, "intent": original["intent"]}
                receipt["selection"] = compare_selection(
                    original, expected, plan["comparedFields"]
                )
                receipt["resolutionMatched"] = resolution_matches(case, result)
                log("evaluated", receipt)
                if receipt.get("financialSignal"):
                    raise Halt("BILLING_OR_FINANCIAL_UNCERTAINTY")
                if receipt["providerError"]:
                    raise Halt(receipt["providerError"])
                if not receipt["parsing"]["pydantic"] or not result["zod"]["valid"]:
                    raise Halt("CRITICAL_STRUCTURAL_FAILURE")
                if result["wouldAuthorizeEffect"]:
                    raise Halt("RISK_OF_REAL_EFFECTS")
                if (
                    not receipt["selection"]["categoricalSelectionPassed"]
                    or not receipt["resolutionMatched"]
                ):
                    raise Halt("SEMANTIC_FAILURE_OPERATOR_REVIEW_REQUIRED")
            report["status"] = "COMPLETED_CATEGORICAL_REVIEW_PENDING"
        except Halt as exc:
            report.update(status="INTERRUPTED", stopReason=str(exc))
        except Exception:
            report.update(
                status="INTERRUPTED", stopReason="UNVERIFIABLE_EXECUTION_FAILURE"
            )
        report["reservedRequests"] = len(budget.used)
        report["sdkInvocations"] = sum(
            bool(r.get("sdkStarted")) for r in report["attempts"]
        )
        report["realProviderRequests"] = 0 if offline else report["sdkInvocations"]
        report["notAttempted"] = [
            c for c in CASE_IDS if (c, "PROPOSE") not in budget.used
        ]
        log("finished", {k: v for k, v in report.items() if k != "attempts"})
    with (directory / "result.json").open("x") as out:
        json.dump(report, out, ensure_ascii=False, indent=2)
        out.write("\n")
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest-sha256", required=True)
    parser.add_argument("--authorize-live", action="store_true")
    parser.add_argument("--round-id")
    parser.add_argument("--confirm-free-project", action="store_true")
    parser.add_argument("--confirm-billing-disabled", action="store_true")
    parser.add_argument("--project-label")
    parser.add_argument("--key-fingerprint")
    args = parser.parse_args()
    os.umask(0o077)
    for name in ("LANGSMITH_TRACING", "LANGCHAIN_TRACING_V2", "LANGCHAIN_TRACING"):
        os.environ[name] = "false"
    try:
        settings = Settings()
        normal_settings(settings)
        if not args.authorize_live:
            plan = preflight(ROOT, args.manifest_sha256)
            print(
                json.dumps(
                    {
                        "status": "PREFLIGHT_ONLY",
                        "roundId": plan["roundId"],
                        "realProviderRequests": 0,
                    }
                )
            )
            return
        approval = {
            "authorized": True,
            "roundId": args.round_id,
            "manifestDigest": args.manifest_sha256,
            "freeProject": args.confirm_free_project,
            "billingDisabled": args.confirm_billing_disabled,
            "projectLabel": args.project_label,
            "keyFingerprint": args.key_fingerprint,
        }
        result = asyncio.run(
            run_round(
                ROOT,
                args.manifest_sha256,
                args.round_id or "",
                settings=settings,
                approval=approval,
            )
        )
        print(
            json.dumps(
                {
                    k: result.get(k)
                    for k in ("status", "stopReason", "roundId", "realProviderRequests")
                }
            )
        )
        if result["status"] == "INTERRUPTED":
            raise SystemExit(1)
    except Halt as exc:
        print(json.dumps({"status": "BLOCKED_BEFORE_EXECUTION", "reason": str(exc)}))
        raise SystemExit(1) from None
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        print(
            json.dumps(
                {
                    "status": "BLOCKED_BEFORE_EXECUTION",
                    "reason": "PREFLIGHT_OR_AUTHORIZATION_FAILED",
                }
            )
        )
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
