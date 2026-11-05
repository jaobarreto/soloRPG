"""Offline literary diagnostics; no provider imports, network or automatic scores."""

import argparse
import hashlib
import json
import re
from collections import Counter
from pathlib import Path
from typing import Any

from app.evaluation.narrative_lab import literary_eligibility

CATALOG_KIND = "PURE_PRODUCTION_CATALOG_POLICY_SCRIPTED_SELECTION"
HISTORICAL_KIND = "SCRIPTED_PRODUCTION_GRAPH_HTTP_AND_DISPOSABLE_POSTGRES"
AUDIT_PHRASES = (
    "resultado confirmado",
    "não comprova",
    "verdade do mundo",
    "resposta autorizada",
    "alegação",
    "nenhum efeito foi aplicado",
    "não é confirmar",
    "não tenho elementos",
)


def body(text: str) -> str:
    """Strip only the attributed display name, not facts or epistemic qualifiers."""
    return re.sub(r"^[^\n—]{1,100} — ", "", text, count=1)


def quote_depth(text: str) -> int:
    return max(
        (
            match.group(0).count(">")
            for line in text.splitlines()
            if (match := re.match(r"^\s*(?:>\s*)+", line))
        ),
        default=0,
    )


def published_beats(turn: dict[str, Any]) -> list[dict[str, Any]] | None:
    if "publishedBeats" in turn:
        return turn["publishedBeats"]  # type: ignore[no-any-return]
    trace = next(
        (t for t in reversed(turn.get("trace", [])) if t["stage"] == "NARRATE"),
        None,
    )
    if trace is None:
        return None
    selected = trace.get("selected", [])
    if "\n\n".join(b["text"] for b in selected) == turn["publicText"]:
        return selected  # type: ignore[no-any-return]
    # A rejected draft is never counted as published. Recover only an exact
    # server-catalog fallback; deterministic text without a trace remains unknown.
    return next(
        ([b] for b in trace["catalog"] if b["text"] == turn["publicText"]), None
    )


def repetition(values: list[str]) -> dict[str, Any]:
    counts = Counter(values)
    return {
        "occurrences": len(values),
        "distinct": len(counts),
        "repeatedBeyondFirst": sum(v - 1 for v in counts.values()),
        "distribution": dict(counts.most_common()),
    }


def measure(run: dict[str, Any]) -> dict[str, Any]:
    turns = run["turns"]
    texts = [t["publicText"] for t in turns]
    beats = [published_beats(t) for t in turns]
    fragments = [[b["text"] for b in (bs or [])] for bs in beats]
    prepared_counts: list[int] = []
    generic_over_context = 0
    contextual_observable = 0
    reference_checks: list[bool] = []
    reasons: Counter[str] = Counter()
    source_sets: list[dict[str, Any]] = []
    for turn, bs in zip(turns, beats, strict=True):
        trace: dict[str, Any] = next(
            (t for t in reversed(turn.get("trace", [])) if t["stage"] == "NARRATE"),
            {},
        )
        prepared = turn.get("preparedReplies", trace.get("preparedReplies"))
        if prepared is not None:
            prepared_counts.append(len(prepared))
            spoken = [b for b in (bs or []) if b["kind"] == "DIALOGUE"]
            if prepared and spoken:
                contextual_observable += 1
                if not any(b == r["beat"] for b in spoken for r in prepared):
                    generic_over_context += 1
        facts = turn.get("authorizedFacts", trace.get("facts"))
        if facts is not None and bs is not None:
            own = {f["eventId"] for f in facts}
            ids = [i for b in bs for i in b["factIds"]]
            if ids:
                reference_checks.append(set(ids) <= own)
            source_sets.append(
                {
                    "turnId": turn["id"],
                    "session": turn.get("session"),
                    "authorizedFactIds": sorted(own),
                    "selectedFactIds": sorted(set(ids)),
                }
            )
        metadata = turn.get("metadata", {})
        reason = turn.get("validationReason", metadata.get("renderingValidation"))
        if reason and reason != "ACCEPTED":
            reasons[reason] += 1
    dialogue_fragments = [
        body(b["text"]) for bs in beats for b in (bs or []) if b["kind"] == "DIALOGUE"
    ]
    opening = [re.split(r"(?<=[.!?])\s", t, maxsplit=1)[0] for t in dialogue_fragments]
    closing = [t.splitlines()[-1] for t in texts if t.splitlines()]
    structural = []
    for text, bs in zip(texts, beats, strict=True):
        # Explicit approximation, not a parser or a naturalness score.
        lengths = [len(s.split()) for s in re.split(r"[.!?]\s*", body(text)) if s]
        buckets = [
            "short" if n <= 6 else "medium" if n <= 15 else "long" for n in lengths
        ]
        structural.append(
            "/".join(b["kind"] for b in (bs or [])) + ":" + "/".join(buckets)
        )
    findings = [
        value
        for turn in turns
        for value in turn.get("canonicalFindings", turn.get("canonicalViolations", []))
    ]
    return {
        "scenarioId": run["scenarioId"],
        "selector": run["selector"],
        "turns": len(turns),
        "fullReplies": repetition(texts),
        "identicalAdjacentReplies": sum(
            a == b for a, b in zip(texts, texts[1:], strict=False)
        ),
        "publishedFragments": repetition([v for fs in fragments for v in fs]),
        "unknownPublishedBeatTurns": sum(bs is None for bs in beats),
        "identicalFragmentsAcrossAdjacentTurns": sum(
            sum(v in previous for v in current)
            for previous, current in zip(fragments, fragments[1:], strict=False)
        ),
        "openingSentenceProxy": repetition(opening),
        "lastLine": repetition(closing),
        "syntacticStructureProxy": repetition(structural),
        "maxQuoteDepth": max((quote_depth(t) for t in texts), default=0),
        "nestedQuoteTurns": sum(quote_depth(t) > 1 for t in texts),
        "auditLanguageProxy": {
            "turnsFlagged": sum(
                any(p in t.lower() for p in AUDIT_PHRASES) for t in texts
            ),
            "phrases": list(AUDIT_PHRASES),
            "interpretation": "HUMAN_REVIEW_SIGNAL_NOT_A_LITERARY_GRADE",
        },
        "eligiblePreparedCounts": prepared_counts,
        "eligiblePreparedDistribution": dict(Counter(map(str, prepared_counts))),
        "contextualSelectionObservableTurns": contextual_observable,
        "genericInsteadOfPrepared": generic_over_context,
        "noContentClarifications": sum(t.get("contentGap") is True for t in turns),
        "noContentClassificationAvailable": any("contentGap" in t for t in turns),
        "publicationRejections": dict(reasons),
        "publishedFallbacks": sum(
            bool(t.get("metadata", {}).get("deterministicFallback")) for t in turns
        ),
        "referencedTurnsCheckedAgainstOwnProjection": len(reference_checks),
        "allSelectedReferencesInOwnProjection": all(reference_checks)
        if reference_checks
        else None,
        "sourceSetsByTurn": source_sets,
        "semanticSourceRelevance": None,
        "semanticSourceRelevanceStatus": (
            "REQUIRES_CITED_HUMAN_REVIEW_IDS_AND_HASHES_ARE_NOT_MEANING"
        ),
        "canonicalGateFromRecordedFindings": literary_eligibility(findings),
        "gateScope": "EXPLICIT_TEST_OR_REVIEW_FINDINGS_NOT_A_SEMANTIC_ORACLE",
        "humanLiteraryScores": None,
    }


def voice_pair(left: str, right: str) -> dict[str, Any]:
    a, b = body(left), body(right)
    aa, bb = set(re.findall(r"\w+", a.lower())), set(re.findall(r"\w+", b.lower()))
    return {
        "left": left,
        "right": right,
        "sameAfterRemovingDisplayName": a == b,
        "tokenJaccardProxy": round(len(aa & bb) / len(aa | bb), 4) if aa | bb else None,
        "perceptiblePersonalityScore": None,
        "limit": "Textual difference is not proof of perceptible character identity.",
    }


def history_comparison(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    for data in (before, after):
        if data.get("evidenceKind") != HISTORICAL_KIND or not data.get("complete"):
            raise ValueError("Explicit complete scripted historical artifacts required")

    def sequence(data: dict[str, Any]) -> dict[tuple[str, str], list[Any]]:
        return {
            (r["scenarioId"], r["selector"]): [t["step"] for t in r["turns"]]
            for r in data["runs"]
        }

    if sequence(before) != sequence(after):
        raise ValueError("Historical player sequences are not comparable")
    return {
        "comparableMessages": True,
        "before": [measure(r) for r in before["runs"]],
        "after": [measure(r) for r in after["runs"]],
        "limit": (
            "B changes reviewed preparation and scripted selection together. No"
            " causal model or statistical improvement claim."
        ),
    }


def build_plan(catalog: dict[str, Any]) -> dict[str, Any]:
    cases = catalog["liveCases"]
    if len(cases) != 6 or len({c["caseId"] for c in cases}) != 6:
        raise ValueError("Exactly six frozen live diagnostic turns required")
    return {
        "phase": "5.6.3C.1",
        "status": "PREPARED_NOT_AUTHORIZED_NOT_EXECUTED",
        "authorizationRequired": (
            "NEW_EXPLICIT_OPERATOR_AUTHORIZATION_FOR_THIS_ROUND_AND_CONFIRMATIO"
            "N_OF_FREE_PROJECT_WITH_BILLING_DISABLED"
        ),
        "executionInterface": (
            "OFFLINE_PREPARATION_ONLY_NO_LIVE_EXECUTOR_IMPLEMENTED_IN_C0"
        ),
        "provider": "gemini",
        "model": "gemini-3.5-flash-lite",
        "maxRequests": 12,
        "maxProposeRequests": 6,
        "maxNarrateRequests": 6,
        "outputTokenLimits": {
            "PROPOSE": 700,
            "NARRATE": 1200,
            "aggregateConfiguredCeiling": 11400,
        },
        "inputUsage": (
            "Record provider-reported input/output/total tokens, usageReported,"
            " modelVersion and elapsed milliseconds per attempt; missing usage "
            "is null, never zero. Character counts are not tokens/cost."
        ),
        "maxInputCharactersPerRequest": 65000,
        "retries": 0,
        "providerFallback": False,
        "modelSwitching": False,
        "llmRepair": False,
        "realCampaignOrDatabaseWrites": False,
        "financialConfigurationChanges": False,
        "reuseUnusedAttempts": False,
        "cases": cases,
        "proposeComparedFields": [
            "kind",
            "intent",
            "expression",
            "target.type",
            "target.name",
            "tool.type",
            "tool.topic",
            "tool.act",
            "evidence",
        ],
        "descriptionComparison": (
            "No exact wording requirement; description must preserve the player "
            "request without extra material claims."
        ),
        "payloadRule": (
            "Send only the exact proposeRequest/narrateRequest through "
            "production graph/prompt/schema/router. Never send "
            "expectedProposal, acceptableSemanticSelections, "
            "authorizedPreparedBeats or review criteria as extra prompt "
            "material."
        ),
        "stageProcedure": [
            (
                "Verify all input/source/code hashes, current model and flags; "
                "dry-run scripted graph and NestJS pure authorization before "
                "requesting authorization."
            ),
            (
                "Operator approves a new bounded round and confirms active key "
                "belongs to the free project with billing disabled; do not persist "
                "the financial confirmation."
            ),
            (
                "For each case consume at most one PROPOSE call; save original "
                "provider JSON before Pydantic/graph assembly and usage including "
                "errors."
            ),
            (
                "Validate Pydantic/Zod and compare "
                "intent/expression/target/topic/act to frozen semantic criteria. "
                "Any wrong choice is a failed case, even if safely clarified."
            ),
            (
                "On a semantic PROPOSE failure skip that case's NARRATE without "
                "correcting the proposal or reusing its slot; operator may review "
                "remaining independent frozen cases within the same approved round."
            ),
            (
                "Only after a correct PROPOSE, replay the same deterministic NestJS"
                " authorization; offer the exact frozen NARRATE catalog with one "
                "call. No mechanical execution or DB required for these dialogue "
                "projections."
            ),
            (
                "Preserve raw JSON, assembled graph output and NestJS "
                "validation/publication separately. A safe publication fallback "
                "does not turn a failed selection into a pass."
            ),
            (
                "No dynamic assistant history is injected: current production "
                "NARRATE has no recent-fragment history. The short sequences test "
                "repeated choices over the frozen state, not full persistence or "
                "adaptive dialogue."
            ),
            (
                "Stop after the authorized attempts and submit the complete report,"
                " including errors and unused slots; no automatic phase transition."
            ),
        ],
        "stopImmediately": [
            "AUTHENTICATION_ERROR",
            "BILLING_OR_FINANCIAL_UNCERTAINTY",
            "HTTP_429",
            "UNEXPECTED_MODEL",
            "CRITICAL_STRUCTURAL_FAILURE",
            "SECRET_DISCLOSURE",
            "RISK_OF_REAL_EFFECTS",
            "HASH_DRIFT",
            "BUDGET_EXHAUSTED",
        ],
        "interpretation": {
            "selectionFailure": (
                "Relevant authorized alternative exists but model chooses "
                "generic/wrong/unapproved material; record semantic failure "
                "separately from structural authorization."
            ),
            "contentGap": (
                "No adequate eligible alternative exists: charge to "
                "preparation/library/provenance, not to the model's writing "
                "ability."
            ),
            "literaryReview": (
                "Two human passes: visible message/sequence first with names masked"
                " for voice comparison, then full authorized context and "
                "original/raw/published comparison. Cite excerpts and justify 1–5 "
                "or N/A; scores start null."
            ),
            "eliminators": (
                "Any agency, secrecy, canonical/mechanical contradiction or "
                "unauthorized consequence fails irrespective of literary scores."
            ),
        },
        "limitations": [
            (
                "Six turns: three regular conflict, two Story Card promise, one "
                "matched warm regular. No long real conversation or complete "
                "campaign validation."
            ),
            (
                "Sequences use frozen synthetic projections, not a new campaign, "
                "database persistence or world evolution."
            ),
            (
                "No real mechanical-result narration in this small sample; "
                "NAR-09/10 remain offline plus existing engine regressions."
            ),
            (
                "Raw-response capture and a round-wide budget wrapper must be "
                "implemented and tested in C.1 before authorization; existing "
                "router has per-instance limits only. No endpoint, key or live "
                "command is supplied here."
            ),
            "G3/G4/G5/G6 are proposals only and have not been implemented.",
        ],
        "humanReviewCompleted": False,
        "geminiLiteraryQualityApproved": False,
    }


def analyze(root: Path, catalog: dict[str, Any]) -> dict[str, Any]:
    if catalog.get("evidenceKind") != CATALOG_KIND or not catalog.get("complete"):
        raise ValueError("Expected a completed pure production catalog diagnostic")
    if (
        catalog.get("realProviderRequests") != 0
        or catalog.get("databaseUsed") is not False
    ):
        raise ValueError("Offline catalog evidence only")
    expected = {
        (f"NAR-{n:02}", s)
        for n in range(1, 13)
        for s in ("FIRST_PREPARED", "ROTATE_PREPARED")
    }
    actual = {(r["scenarioId"], r["selector"]) for r in catalog["runs"]}
    if actual != expected or len(catalog["runs"]) != len(expected):
        raise ValueError("Incomplete twelve-scenario/two-selector diagnostic")
    frozen = json.loads(
        (root / "apps/api/test/fixtures/phase563c0-literary.json").read_text()
    )
    steps = {s["id"]: s["turns"] for s in frozen["scenarios"]}
    for run in catalog["runs"]:
        wanted = steps[run["scenarioId"]]
        if len(run["turns"]) != len(wanted) or any(
            any(observed.get(key) != value for key, value in original.items())
            for original, observed in zip(wanted, run["turns"], strict=True)
        ):
            raise ValueError("Catalog differs from frozen messages/context selectors")
    paths = [
        root / f"docs/ai/{name}"
        for name in (
            "phase-5.6.3a-lab-result.json",
            "phase-5.6.3b-lab-result.json",
            "phase-5.6.3b-1-story-results.json",
        )
    ]
    before, after, story = [json.loads(p.read_text()) for p in paths]
    if (
        story.get("realProviderRequests") != 0
        or story.get("evidenceKind")
        != "HTTP_NEST_FASTAPI_PRODUCTION_GRAPH_SCRIPTED_PROVIDER_DISPOSABLE_POSTGRES"
    ):
        raise ValueError("Expected explicitly scripted Story Card historical evidence")
    pairs = []
    for run in catalog["runs"]:
        if run["scenarioId"] == "NAR-08":
            for i, label in ((0, "REGULAR"), (2, "STORY_CARD")):
                pairs.append(
                    {
                        "selector": run["selector"],
                        "kind": label,
                        **voice_pair(
                            run["turns"][i]["publicText"],
                            run["turns"][i + 1]["publicText"],
                        ),
                    }
                )
    return {
        "phase": "5.6.3C.0",
        "evidenceKind": "OFFLINE_CATALOG_AND_HISTORICAL_TEXT_DIAGNOSTICS",
        "realProviderRequests": 0,
        "automaticLiteraryScores": None,
        "humanScores": None,
        "geminiLiteraryQualityApproved": False,
        "metricsVersion": 1,
        "historicalInputHashes": {
            str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in paths
        },
        "historicalComparison": history_comparison(before, after),
        "storyCardHistoricalExamples": {
            "comparisonScope": (
                "Two distinct positive examples; not a sequence comparable to A/B. "
                "The repeated Lior row is the same fixture example, not a new "
                "independent observation."
            ),
            "voicePair": voice_pair(*story["evidence"][1]["published"]),
            "publishedSource": story["evidence"][1]["test"],
        },
        "catalogRuns": [measure(r) for r in catalog["runs"]],
        "catalogControls": catalog["controls"],
        "pairedVoices": pairs,
        "objectiveMeasures": [
            "Exact string/fragment occurrences and adjacent repetition",
            "Current production eligible prepared alternatives per selected pair",
            "Quote nesting depth",
            "Exact selected fact IDs in own authorized projection",
            "Recorded policy clarifications and publication rejections kept separate",
        ],
        "approximations": [
            "Opening sentence punctuation split",
            (
                "Syntactic buckets by sentence lengths and beat kinds, not "
                "grammatical analysis"
            ),
            "Token Jaccard voice distance",
            "Audit-language phrase flags, not proof of artificiality",
        ],
        "unmeasured": [
            "Human naturalness/personality/pertinence scores",
            "Gemini topic/act/beat selection",
            "Real tokens/latency",
            "Long adaptive real dialogue",
            "Semantic truth of reviewed source associations",
        ],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--plan-output", type=Path, required=True)
    args = parser.parse_args()
    targets = [args.output.resolve(), args.plan_output.resolve()]
    if len(set(targets)) != 2 or any(p.exists() for p in targets):
        raise FileExistsError("Output must be new; historical evidence is immutable")
    catalog = json.loads(args.catalog.read_text())
    metrics = analyze(args.root.resolve(), catalog)
    plan = build_plan(catalog)
    metrics["catalogSha256"] = hashlib.sha256(args.catalog.read_bytes()).hexdigest()
    plan["catalogSha256"] = metrics["catalogSha256"]
    plan["productionAndFixtureHashes"] = {
        str(p.relative_to(args.root)): hashlib.sha256(p.read_bytes()).hexdigest()
        for relative in (
            "apps/ai-service/app/narrative/prompts.py",
            "apps/ai-service/app/narrative/graph.py",
            "apps/ai-service/app/narrative/schemas.py",
            "apps/ai-service/app/narrative/selection.py",
            "apps/ai-service/app/providers/router.py",
            "apps/ai-service/app/providers/gemini.py",
            "apps/ai-service/app/core/config.py",
            "apps/api/src/narrative/rendering.ts",
            "apps/api/src/narrative/dialogue-content.ts",
            "apps/api/src/narrative/story-card-dialogue.ts",
            "apps/api/src/narrative/context.service.ts",
            "apps/api/src/narrative/free-action.ts",
            "apps/api/src/narrative/narrative.service.ts",
            "apps/api/src/adventures/core/scenes/story-dialogue.ts",
            "packages/shared-contracts/src/dialogue.ts",
            "packages/shared-contracts/src/free-action.ts",
            "packages/shared-contracts/src/narrative.ts",
            "apps/api/test/fixtures/phase563c0-literary.json",
        )
        for p in [args.root / relative]
    }
    for path, data in ((args.output, metrics), (args.plan_output, plan)):
        with path.open("x") as out:
            json.dump(data, out, indent=2, ensure_ascii=False)
            out.write("\n")
    print(
        json.dumps(
            {
                "scenarios": 12,
                "scriptedTurns": sum(r["turns"] for r in metrics["catalogRuns"]),
                "realProviderRequests": 0,
                "plannedRequests": plan["maxRequests"],
            }
        )
    )


if __name__ == "__main__":
    main()
