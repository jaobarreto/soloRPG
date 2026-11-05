"""Bounded C.1 evaluation CLI. Defaults to preflight; live needs a new authorization."""

import argparse
import asyncio
import hashlib
import json
import os
import subprocess
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, TypeVar
from uuid import UUID, uuid4

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import Settings
from app.evaluation.literary_capture import MODEL, observe_sdk
from app.evaluation.literary_preparation import measure
from app.narrative.graph import run_turn
from app.narrative.schemas import Narration, SelectedFreeAction, TurnRequest
from app.providers.errors import ProviderError
from app.providers.router import ProviderRouter

ROOT = Path(__file__).resolve().parents[4]
PLAN = "docs/ai/phase-5.6.3c-1-live-plan.json"
PLAN_SHA = "04c31b43e50bd39573e75529590f5c33128d806e426930858263b40a8b93d712"
MANIFEST = "docs/ai/phase-5.6.3c-1-executor-manifest.json"
T = TypeVar("T", bound=BaseModel)


class Halt(RuntimeError):
    """Codes only: never pass provider exception text or credentials here."""


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def verify(root: Path, approved_manifest: str | None = None) -> dict[str, Any]:
    try:
        raw = (root / PLAN).read_bytes()
        if sha(raw) != PLAN_SHA:
            raise Halt("FROZEN_PLAN_DRIFT")
        plan = json.loads(raw)
        manifest_bytes = (root / MANIFEST).read_bytes()
        if approved_manifest and sha(manifest_bytes) != approved_manifest:
            raise Halt("EXECUTOR_MANIFEST_DRIFT")
        manifest = json.loads(manifest_bytes)
        hashes = {**plan["productionAndFixtureHashes"], **manifest["files"]}
        hashes["docs/ai/phase-5.6.3c-0-catalog-results.json"] = plan["catalogSha256"]
        for relative, expected in hashes.items():
            path = root / relative
            if not path.resolve().is_relative_to(root.resolve()):
                raise Halt("UNSAFE_MANIFEST_PATH")
            if sha(path.read_bytes()) != expected:
                raise Halt("FROZEN_FILE_DRIFT")
        if [c["caseId"] for c in plan["cases"]] != [f"C1-{i}" for i in range(1, 7)]:
            raise Halt("CASE_IDENTITY_DRIFT")
        for entry in plan["cases"]:
            for field, stage in (
                ("proposeRequest", "PROPOSE"),
                ("narrateRequest", "NARRATE"),
            ):
                request = TurnRequest.model_validate(entry[field])
                if request.stage != stage:
                    raise Halt("STAGE_IDENTITY_DRIFT")
        return plan  # type: ignore[no-any-return]
    except (OSError, ValueError, KeyError, ValidationError) as exc:
        raise Halt("INTEGRITY_UNVERIFIABLE") from exc


def authorize(
    settings: Settings, approval: dict[str, Any], *, manifest_digest: str
) -> Settings:
    if not approval.get("authorized"):
        raise Halt("NEW_ROUND_AUTHORIZATION_REQUIRED")
    if not approval.get("freeProject") or not approval.get("billingDisabled"):
        raise Halt("FINANCIAL_CONFIRMATION_REQUIRED")
    if not approval.get("projectLabel") or not approval.get("keyFingerprint"):
        raise Halt("KEY_PROJECT_IDENTITY_UNVERIFIED")
    if approval.get("manifestDigest") != manifest_digest:
        raise Halt("EXECUTOR_APPROVAL_MISMATCH")
    if settings.ai_free_tier_confirmed:
        raise Halt("NORMAL_FINANCIAL_PROTECTION_MUST_REMAIN_DISABLED")
    if settings.llm_provider != "gemini" or settings.gemini_model != MODEL:
        raise Halt("PROVIDER_MODEL_MISMATCH")
    if settings.enable_provider_fallback:
        raise Halt("PROVIDER_FALLBACK_FORBIDDEN")
    key = settings.gemini_api_key
    if key is None or not key.get_secret_value():
        raise Halt("KEY_PROJECT_IDENTITY_UNVERIFIED")
    if sha(key.get_secret_value().encode()) != approval["keyFingerprint"]:
        raise Halt("KEY_PROJECT_IDENTITY_UNVERIFIED")
    # This copy belongs solely to this authorized CLI. No env/cache/global update.
    return settings.model_copy(deep=True, update={"ai_free_tier_confirmed": True})


class Budget:
    def __init__(self, maximum: int = 12):
        if not 0 <= maximum <= 12:
            raise Halt("INVALID_BUDGET")
        self.maximum = maximum
        self.used: set[tuple[str, str]] = set()
        self.retired: set[str] = set()
        self.ready: set[str] = set()
        self.ceiling = 0
        self.lock = threading.Lock()

    def reserve(
        self, case: str, stage: str, characters: int, tokens: int
    ) -> dict[str, Any]:
        with self.lock:
            if case not in {f"C1-{i}" for i in range(1, 7)} or stage not in {
                "PROPOSE",
                "NARRATE",
            }:
                raise Halt("UNKNOWN_SLOT")
            expected = 700 if stage == "PROPOSE" else 1200
            if tokens != expected or characters > 65000:
                raise Halt("REQUEST_LIMIT")
            if (case, stage) in self.used or (
                stage == "NARRATE" and case in self.retired
            ):
                raise Halt("SLOT_ALREADY_USED_OR_RETIRED")
            if stage == "NARRATE" and case not in self.ready:
                raise Halt("NARRATE_NOT_AUTHORIZED")
            if (
                len(self.used) >= self.maximum
                or sum(s == stage for _, s in self.used) >= 6
                or self.ceiling + tokens > 11400
            ):
                raise Halt("GLOBAL_BUDGET_EXHAUSTED")
            self.used.add((case, stage))
            self.ceiling += tokens
            return {
                "caseId": case,
                "stage": stage,
                "reserved": len(self.used),
                "configuredOutputCeilingReserved": self.ceiling,
            }

    def retire_narrate(self, case: str) -> None:
        self.retired.add(case)
        self.ready.discard(case)


class Journal:
    def __init__(self, directory: Path, ledger: Path, round_id: str):
        UUID(round_id)
        if directory.exists():
            raise Halt("RECEIPT_ALREADY_EXISTS")
        ledger.mkdir(parents=True, exist_ok=True)
        try:
            descriptor = os.open(
                ledger / round_id, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600
            )
        except FileExistsError as exc:
            raise Halt("ROUND_ALREADY_CLAIMED") from exc
        with os.fdopen(descriptor, "w") as claim:
            claim.write(PLAN_SHA + "\n")
        directory.mkdir(mode=0o700)
        self.directory = directory
        self.file = os.fdopen(
            os.open(
                directory / "events.jsonl", os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600
            ),
            "w",
        )

    def append(self, kind: str, data: dict[str, Any]) -> None:
        self.file.write(
            json.dumps({"type": kind, "data": data}, ensure_ascii=False) + "\n"
        )
        self.file.flush()
        os.fsync(self.file.fileno())

    def finish(self, report: dict[str, Any]) -> None:
        self.append(
            "finished",
            {"status": report["status"], "attempts": len(report["attempts"])},
        )
        self.file.close()
        for name, content in (
            ("result.json", report),
            ("human-review.json", review_sheet(report)),
        ):
            with os.fdopen(
                os.open(
                    self.directory / name, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600
                ),
                "w",
            ) as out:
                json.dump(content, out, indent=2, ensure_ascii=False)
                out.write("\n")


def replay(
    root: Path, case: str, stage: str, raw: str | None, graph: Any
) -> dict[str, Any]:
    response = subprocess.run(
        ["node", str(root / "scripts/evaluate-literary-case.mjs")],
        input=json.dumps(
            {"caseId": case, "stage": stage, "rawText": raw, "graphOutput": graph}
        ),
        capture_output=True,
        text=True,
        cwd=root,
        timeout=15,
    )
    if response.returncode:
        raise Halt("NESTJS_REPLAY_UNVERIFIABLE")
    result = json.loads(response.stdout)
    if result.get("error"):
        raise Halt("NESTJS_REPLAY_UNVERIFIABLE")
    return result  # type: ignore[no-any-return]


def compare_selection(
    original: Any, expected: dict[str, Any], fields: list[str]
) -> dict[str, Any]:
    def value(data: Any, field: str) -> Any:
        for key in field.split("."):
            if not isinstance(data, dict) or key not in data:
                return None
            data = data[key]
        return data

    differences = [
        field for field in fields if value(original, field) != value(expected, field)
    ]
    return {
        "categoricalSelectionPassed": not differences,
        "differentFields": differences,
        "descriptionSemanticReview": "PENDING_HUMAN_NOT_EXACT_WORDING",
    }


class ReservedProvider:
    def __init__(
        self,
        router: ProviderRouter,
        budget: Budget,
        case: str,
        stage: str,
        reserve: Callable[[dict[str, Any]], None],
        receipt: dict[str, Any],
    ):
        self.router, self.budget, self.case, self.stage = router, budget, case, stage
        self.record_reservation, self.receipt = reserve, receipt

    async def generate_structured(
        self, prompt: str, output_schema: type[T], *, max_output_tokens: int
    ) -> T:
        reserved = self.budget.reserve(
            self.case, self.stage, len(prompt), max_output_tokens
        )
        self.record_reservation(reserved)  # durable before any SDK construction/call
        self.receipt.update(
            attemptReserved=True,
            inputCharacters=len(prompt),
            promptSha256=sha(prompt.encode()),
            configuredOutputLimit=max_output_tokens,
        )
        return await self.router.generate_structured(
            prompt, output_schema, max_output_tokens=max_output_tokens
        )


def parse_original(receipt: dict[str, Any], stage: str) -> Any:
    raw = receipt["rawText"]
    if raw is None:
        receipt["parsing"] = {
            "json": False,
            "pydantic": False,
            "errors": ["NO_SAFE_RAW_RESPONSE"],
        }
        return None
    try:
        original = json.loads(raw)
    except ValueError:
        receipt["parsing"] = {
            "json": False,
            "pydantic": False,
            "errors": ["INVALID_JSON"],
        }
        return None
    schema = SelectedFreeAction if stage == "PROPOSE" else Narration
    try:
        parsed = schema.model_validate_json(raw)
    except ValidationError as exc:
        receipt["parsing"] = {
            "json": True,
            "pydantic": False,
            "errors": [
                e["type"] for e in exc.errors(include_input=False, include_url=False)
            ],
        }
    else:
        receipt["parsing"] = {"json": True, "pydantic": True, "errors": []}
        receipt["structuredOriginal"] = parsed.model_dump(mode="json")
    return original


def review_sheet(report: dict[str, Any]) -> dict[str, Any]:
    dimensions = [
        "naturalidade",
        "personalidade",
        "contextualização",
        "continuidade",
        "variedade",
        "qualidade literária",
        "ritmo",
        "agência",
        "fidelidade ao cânone",
        "segurança narrativa",
    ]
    return {
        "roundId": report["roundId"],
        "rubric": "docs/ai/phase-5.6.3c-literary-evaluation.md",
        "reviewer": None,
        "humanApproved": False,
        "automaticLiteraryScores": None,
        "eliminatoryFindings": [],
        "cases": [
            {
                "caseId": c,
                "scores": {d: None for d in dimensions},
                "citedExcerpts": [],
                "sourcePertinence": None,
                "selectionVersusContent": None,
                "rationale": None,
            }
            for c in [f"C1-{i}" for i in range(1, 7)]
        ],
    }


async def run_round(
    root: Path,
    directory: Path,
    round_id: str,
    *,
    settings: Settings,
    approval: dict[str, Any],
    offline: bool,
    transport: Callable[[httpx.Request], httpx.Response] | None = None,
    ledger: Path | None = None,
) -> dict[str, Any]:
    manifest_digest = sha((root / MANIFEST).read_bytes())
    verify(root, approval.get("manifestDigest"))
    if offline and transport is None:
        raise Halt("OFFLINE_TRANSPORT_REQUIRED")
    if not offline and transport is not None:
        raise Halt("LIVE_TRANSPORT_OVERRIDE_FORBIDDEN")
    if not offline:
        authorize(settings, approval, manifest_digest=manifest_digest)
    # Confirm actual compiled NestJS contracts/policies before any provider call.
    plan = verify(root, manifest_digest)
    for entry in plan["cases"]:
        check = replay(
            root,
            entry["caseId"],
            "PROPOSE",
            json.dumps(entry["expectedProposal"]),
            None,
        )
        if not check["zod"]["valid"] or check["resolution"]["category"] != "DIALOGUE":
            raise Halt("NESTJS_PREFLIGHT_FAILED")
    journal = Journal(directory, ledger or root / ".tools/evaluation-rounds", round_id)
    budget = Budget()
    report: dict[str, Any] = {
        "phase": "5.6.3C.1",
        "roundId": round_id,
        "mode": "OFFLINE_MEMORY_HTTP" if offline else "AUTHORIZED_REAL_GEMINI",
        "status": "RUNNING",
        "planSha256": PLAN_SHA,
        "executorManifestSha256": manifest_digest,
        "createdAt": datetime.now(UTC).isoformat(),
        "attempts": [],
        "campaignWrites": False,
        "realProviderRequests": 0,
        "humanLiteraryApproved": False,
        "limits": {
            "requests": 12,
            "PROPOSE": 6,
            "NARRATE": 6,
            "characters": 65000,
            "configuredOutputTokenCeiling": 11400,
        },
        "continueIndependentAfterSemanticFailure": bool(
            approval.get("continueIndependent", False)
        ),
        "authorization": {
            "source": "SYNTHETIC_TEST_ONLY" if offline else "NEW_OPERATOR_ROUND",
            "freeProjectConfirmed": bool(approval.get("freeProject"))
            if not offline
            else None,
            "billingDisabledConfirmed": bool(approval.get("billingDisabled"))
            if not offline
            else None,
            "keyBindingSha256": approval.get("keyFingerprint") if not offline else None,
            "financialConfirmationProcessOnly": True,
            "projectTierIndependentlyVerified": False,
        },
    }
    journal.append("started", {k: v for k, v in report.items() if k != "attempts"})
    try:
        for entry in plan["cases"]:
            for stage in ("PROPOSE", "NARRATE"):
                verify(root, manifest_digest)
                current_settings = (
                    settings
                    if offline
                    else authorize(settings, approval, manifest_digest=manifest_digest)
                )
                if (
                    current_settings.llm_provider != "gemini"
                    or current_settings.gemini_model != MODEL
                    or current_settings.enable_provider_fallback
                ):
                    raise Halt("PROVIDER_MODEL_MISMATCH")
                request_data = entry[
                    "proposeRequest" if stage == "PROPOSE" else "narrateRequest"
                ]
                request = TurnRequest.model_validate(request_data)
                receipt: dict[str, Any] = {
                    "caseId": entry["caseId"],
                    "stage": stage,
                    "requestedProvider": "gemini",
                    "requestedModel": MODEL,
                    "reportedModel": None,
                    "rawText": None,
                    "structuredOriginal": None,
                    "inputTokens": None,
                    "outputTokens": None,
                    "totalTokens": None,
                    "usageReported": False,
                    "latencyMs": None,
                    "providerError": None,
                    "parsing": {"json": None, "pydantic": None, "errors": []},
                    "nest": {
                        "zod": {"valid": None},
                        "resolution": None,
                        "publication": None,
                        "replayStatus": "NOT_RUN",
                    },
                    "fallbackUsed": None,
                    "requestSha256": sha(
                        json.dumps(
                            request_data, sort_keys=True, ensure_ascii=False
                        ).encode()
                    ),
                }
                report["attempts"].append(receipt)
                router = ProviderRouter(current_settings, max_requests=1)
                provider = ReservedProvider(
                    router,
                    budget,
                    entry["caseId"],
                    stage,
                    lambda reservation: journal.append("reserved", reservation),
                    receipt,
                )
                key = current_settings.gemini_api_key
                secrets = [
                    v.get_secret_value()
                    for v in (
                        key,
                        current_settings.groq_api_key,
                        current_settings.ai_internal_token,
                    )
                    if v is not None
                ]
                graph = None
                with observe_sdk(receipt, secrets=secrets, transport=transport):
                    try:
                        response = await run_turn(request, provider)
                        graph = response.model_dump(mode="json")
                    except ProviderError as exc:
                        receipt["providerError"] = exc.code
                errors = [u.error for u in router.usage if u.error]
                if errors:
                    receipt["providerError"] = errors[-1]
                receipt["graphResponse"] = graph
                journal.append("raw-response", receipt)
                original = parse_original(receipt, stage)
                graph_output = (
                    (graph or {}).get("narration") if stage == "NARRATE" else None
                )
                receipt["nest"] = replay(
                    root, entry["caseId"], stage, receipt["rawText"], graph_output
                )
                receipt["fallbackUsed"] = bool(
                    receipt["providerError"] == "INVALID_RESPONSE"
                    or (
                        receipt["nest"].get("publication")
                        and not receipt["nest"]["publication"]["accepted"]
                    )
                )
                if stage == "PROPOSE":
                    receipt["selection"] = compare_selection(
                        original,
                        entry["expectedProposal"],
                        plan["proposeComparedFields"],
                    )
                else:
                    publication = receipt["nest"].get("publication")
                    prepared = entry["authorizedPreparedBeats"]
                    beats = (
                        publication["narration"].get("beats", []) if publication else []
                    )
                    contextual = any(
                        b in prepared for b in beats if b["kind"] == "DIALOGUE"
                    )
                    receipt["selection"] = {
                        "preparedReplyChosen": contextual,
                        "categoricalSelectionPassed": bool(
                            publication
                            and publication["accepted"]
                            and contextual
                            and not receipt["nest"].get("graphChangedNarrative")
                        ),
                        "semanticPertinence": None,
                        "humanReviewRequired": True,
                        "genericDespitePreparedContent": bool(
                            publication and publication["accepted"] and not contextual
                        ),
                    }
                report["realProviderRequests"] = 0 if offline else len(budget.used)
                receipt["modelSelectionOutcome"] = (
                    "NOT_EVALUABLE_INVALID_RAW"
                    if not receipt["parsing"]["pydantic"]
                    else "MATCHED_FROZEN_SELECTION"
                    if receipt["selection"]["categoricalSelectionPassed"]
                    else "FAILED_FROZEN_SELECTION"
                )
                receipt["backendContractRejected"] = not receipt["nest"]["zod"]["valid"]
                receipt["backendSafeBlock"] = bool(
                    receipt["backendContractRejected"]
                    or receipt["nest"].get("backendBlocked", False)
                )
                journal.append("attempt", receipt)
                if receipt.get("financialSignal"):
                    raise Halt("BILLING_OR_FINANCIAL_UNCERTAINTY")
                if receipt["providerError"]:
                    raise Halt(receipt["providerError"])
                if (
                    not receipt["parsing"]["pydantic"]
                    or not receipt["nest"]["zod"]["valid"]
                ):
                    raise Halt("CRITICAL_STRUCTURAL_FAILURE")
                if receipt["nest"].get("wouldAuthorizeEffect"):
                    raise Halt("RISK_OF_REAL_EFFECTS")
                selected = receipt["selection"]["categoricalSelectionPassed"]
                if (
                    stage == "PROPOSE"
                    and receipt["nest"]["resolution"]["category"] != "DIALOGUE"
                ):
                    selected = False
                if not selected:
                    budget.retire_narrate(entry["caseId"])
                    if not approval.get("continueIndependent", False):
                        raise Halt("SEMANTIC_FAILURE_OPERATOR_REVIEW_REQUIRED")
                    break
                if stage == "PROPOSE":
                    budget.ready.add(entry["caseId"])
        report["status"] = "COMPLETED_REVIEW_PENDING"
    except Halt as exc:
        report["status"] = "INTERRUPTED"
        report["stopReason"] = str(exc)
    except Exception:
        report["status"] = "INTERRUPTED"
        report["stopReason"] = "UNVERIFIABLE_EXECUTION_FAILURE"
    finally:
        report["sdkInvocations"] = sum(
            bool(a.get("sdkStarted")) for a in report["attempts"]
        )
        report["realProviderRequests"] = 0 if offline else report["sdkInvocations"]
        report["budget"] = {
            "reservedRequests": len(budget.used),
            "proposeReserved": sum(s == "PROPOSE" for _, s in budget.used),
            "narrateReserved": sum(s == "NARRATE" for _, s in budget.used),
            "configuredOutputCeilingReserved": budget.ceiling,
            "retiredNarrateCases": sorted(budget.retired),
        }
        published = []
        for row in report["attempts"]:
            publication = row.get("nest", {}).get("publication")
            if publication:
                published.append(
                    {
                        "id": row["caseId"],
                        "publicText": publication["narration"]["narrative"],
                        "publishedBeats": publication["narration"].get("beats", []),
                    }
                )
        report["publishedMetrics"] = measure(
            {
                "scenarioId": "FROZEN_SIX_CASE_PROJECTIONS",
                "selector": report["mode"],
                "turns": published,
            }
        )
        report["sequenceMetrics"] = []
        report["caseOutcomes"] = []
        for entry in plan["cases"]:
            rows = [r for r in report["attempts"] if r["caseId"] == entry["caseId"]]
            succeeded = (
                bool(rows)
                and len(rows) == 2
                and all(
                    r.get("selection", {}).get("categoricalSelectionPassed")
                    and not r.get("providerError")
                    and not r.get("nest", {}).get("wouldAuthorizeEffect")
                    for r in rows
                )
            )
            report["caseOutcomes"].append(
                {
                    "caseId": entry["caseId"],
                    "status": "MACHINE_SELECTION_MATCHED_HUMAN_REVIEW_PENDING"
                    if succeeded
                    else "FAILED_OR_INTERRUPTED"
                    if rows
                    else "NOT_ATTEMPTED_AFTER_STOP",
                    "narrateAttempted": any(r["stage"] == "NARRATE" for r in rows),
                    "humanLiteraryApproved": False,
                }
            )
        for sequence in dict.fromkeys(c["sequence"] for c in plan["cases"]):
            ids = {c["caseId"] for c in plan["cases"] if c["sequence"] == sequence}
            report["sequenceMetrics"].append(
                measure(
                    {
                        "scenarioId": sequence,
                        "selector": report["mode"],
                        "turns": [t for t in published if t["id"] in ids],
                    }
                )
            )
        report["metricsScope"] = (
            "Accepted server output/fallback only, virtual publication with no "
            "persistence; six cases are not one adaptive conversation."
        )
        journal.finish(report)
    return report


def offline_transport(
    plan: dict[str, Any],
) -> Callable[[httpx.Request], httpx.Response]:
    """Explicit script at the HTTP boundary, never used for a real round."""
    replies = []
    for entry in plan["cases"]:
        beat = entry["authorizedPreparedBeats"][0]
        replies += [
            entry["expectedProposal"],
            {"narrative": beat["text"], "eventIds": [], "beats": [beat]},
        ]

    def handle(request: httpx.Request) -> httpx.Response:
        payload = replies.pop(0)
        return httpx.Response(
            200,
            json={
                "modelVersion": MODEL,
                "candidates": [
                    {
                        "content": {
                            "role": "model",
                            "parts": [
                                {"text": json.dumps(payload, ensure_ascii=False)}
                            ],
                        },
                        "finishReason": "STOP",
                    }
                ],
            },
        )

    return handle


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument("--dry-run", action="store_true")
    modes.add_argument("--authorize-live", action="store_true")
    parser.add_argument("--output-dir", type=Path)
    parser.add_argument("--round-id")
    parser.add_argument("--approved-manifest-sha256")
    parser.add_argument("--key-fingerprint")
    parser.add_argument("--project-label")
    parser.add_argument("--confirm-free-project", action="store_true")
    parser.add_argument("--confirm-billing-disabled", action="store_true")
    parser.add_argument("--continue-independent", action="store_true")
    args = parser.parse_args()
    try:
        plan = verify(ROOT)
        digest = sha((ROOT / MANIFEST).read_bytes())
        if not args.dry_run and not args.authorize_live:
            settings = Settings()
            key = settings.gemini_api_key
            print(
                json.dumps(
                    {
                        "status": "PREFLIGHT_ONLY_NO_REQUESTS",
                        "manifestSha256": digest,
                        "planSha256": PLAN_SHA,
                        "provider": settings.llm_provider,
                        "model": settings.gemini_model,
                        "fallback": settings.enable_provider_fallback,
                        "normalFinancialConfirmation": settings.ai_free_tier_confirmed,
                        "keyFingerprint": sha(key.get_secret_value().encode())
                        if key
                        else None,
                    }
                )
            )
            return
        if args.output_dir is None or (args.authorize_live and not args.round_id):
            raise Halt("NEW_ROUND_AND_OUTPUT_REQUIRED")
        approval = {
            "authorized": args.authorize_live,
            "freeProject": args.confirm_free_project,
            "billingDisabled": args.confirm_billing_disabled,
            "keyFingerprint": args.key_fingerprint,
            "projectLabel": args.project_label,
            "manifestDigest": args.approved_manifest_sha256,
            "continueIndependent": args.continue_independent,
        }
        if args.dry_run:
            settings = Settings(
                _env_file=None,
                llm_provider="gemini",
                gemini_model=MODEL,
                enable_provider_fallback=False,
                ai_free_tier_confirmed=True,
                gemini_api_key="synthetic-offline-not-a-credential",
            )
        else:
            settings = Settings()
        report = asyncio.run(
            run_round(
                ROOT,
                args.output_dir,
                args.round_id or str(uuid4()),
                settings=settings,
                approval=approval,
                offline=args.dry_run,
                transport=offline_transport(plan) if args.dry_run else None,
            )
        )
        print(
            json.dumps(
                {
                    "status": report["status"],
                    "stopReason": report.get("stopReason"),
                    "reserved": report["budget"]["reservedRequests"],
                    "realProviderRequests": report["realProviderRequests"],
                }
            )
        )
        if report["status"] == "INTERRUPTED":
            raise SystemExit(1)
    except Halt as exc:
        print(json.dumps({"status": "BLOCKED_BEFORE_EXECUTION", "error": str(exc)}))
        raise SystemExit(1) from None
    except (OSError, ValueError):
        print(
            json.dumps(
                {
                    "status": "BLOCKED_BEFORE_EXECUTION",
                    "error": "PREFLIGHT_OR_AUTHORIZATION_FAILED",
                }
            )
        )
        raise SystemExit(1) from None


if __name__ == "__main__":
    main()
