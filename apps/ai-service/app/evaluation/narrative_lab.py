"""Offline transcript metrics. Never grades Gemini or starts a provider."""

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

ELIMINATORS = (
    "UNAUTHORIZED_DISCOVERY",
    "MECHANICAL_CONTRADICTION",
    "SECRET_DISCLOSURE",
    "PROTAGONIST_AGENCY",
    "UNAUTHORIZED_STATE_OR_RELATIONSHIP",
    "ADVENTURE_CANON_CONTRADICTION",
)


def literary_eligibility(violations: list[str]) -> dict[str, Any]:
    """Consumes explicit test/manual findings, never an automatic truth oracle."""
    unknown = set(violations) - set(ELIMINATORS)
    if unknown:
        raise ValueError("Unknown canonical finding")
    return {
        "eligible": not violations,
        "violations": violations,
        "rule": "ANY_CANONICAL_VIOLATION_FAILS_REGARDLESS_OF_LITERARY_SCORES",
    }


def analyze_run(run: dict[str, Any]) -> dict[str, Any]:
    turns = run["turns"]
    texts = [t["publicText"] for t in turns]
    paragraphs = [p for text in texts for p in text.split("\n\n") if p]
    counts = Counter(paragraphs)
    closing = Counter(
        p
        for p in paragraphs
        if p in ("O que você deseja fazer?", "Como deseja prosseguir?")
    )
    narrations = [
        trace
        for turn in turns
        for trace in turn["trace"]
        if trace["stage"] == "NARRATE"
    ]
    return {
        "scenarioId": run["scenarioId"],
        "selector": run["selector"],
        "turns": len(turns),
        "identicalAdjacentReplies": sum(
            a == b for a, b in zip(texts, texts[1:], strict=False)
        ),
        "uniqueReplies": len(set(texts)),
        "paragraphOccurrences": len(paragraphs),
        "repeatedParagraphOccurrences": sum(count - 1 for count in counts.values()),
        "repeatedParagraphs": [
            {"text": text, "count": count}
            for text, count in counts.most_common()
            if count > 1
        ],
        "closingQuestions": dict(closing),
        "dialogueCatalogSizes": [
            sum(b["kind"] == "DIALOGUE" for b in t["catalog"])
            for t in narrations
            if t["category"] == "DIALOGUE"
        ],
        "largestSerializedRequestCharacters": max(
            (t["requestCharacters"] for t in narrations), default=0
        ),
        "publishedFallbacks": sum(
            bool(t["metadata"].get("deterministicFallback")) for t in turns
        ),
        "canonicalGate": literary_eligibility(
            [violation for t in turns for violation in t.get("canonicalViolations", [])]
        ),
        "gateScope": (
            "Assertions/manual findings only; not universal semantic verification"
        ),
        "textualEvidence": [
            {
                "turnId": t["id"],
                "player": t["step"]["text"],
                "published": t["publicText"],
            }
            for t in turns
        ],
    }


def analyze(data: dict[str, Any]) -> dict[str, Any]:
    if (
        data.get("evidenceKind")
        != "SCRIPTED_PRODUCTION_GRAPH_HTTP_AND_DISPOSABLE_POSTGRES"
    ):
        raise ValueError("Expected an explicitly scripted laboratory artifact")
    if not data.get("complete") or len(data["runs"]) != 12:
        raise ValueError("Incomplete six-scenario/two-selector experiment")
    expected = {
        (f"563A-{i:02}", selector)
        for i in range(1, 7)
        for selector in ("FIRST", "VARIED")
    }
    actual = {(run["scenarioId"], run["selector"]) for run in data["runs"]}
    if (
        actual != expected
        or not data.get("eliminatoryControlsValidated")
        or any(len(run["turns"]) < 2 for run in data["runs"])
    ):
        raise ValueError("Missing scenarios or eliminatory controls")
    results = [analyze_run(run) for run in data["runs"]]
    return {
        "phase": "5.6.3A",
        "evidenceKind": "OFFLINE_SCRIPTED_TRANSCRIPT_METRICS",
        "realProviderRequests": 0,
        "geminiLiteraryQualityCertified": False,
        "automaticLiteraryScores": None,
        "runs": results,
        "totalTurns": sum(r["turns"] for r in results),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    result = analyze(json.loads(args.input.read_text()))
    with args.output.open("x") as handle:
        json.dump(result, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(
        json.dumps(
            {
                "runs": len(result["runs"]),
                "totalTurns": result["totalTurns"],
                "realProviderRequests": 0,
            }
        )
    )


if __name__ == "__main__":
    main()
