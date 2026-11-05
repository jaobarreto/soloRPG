"""Compare offline published corpora without providers or literary scoring."""

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from app.evaluation.narrative_lab import analyze


def published(data: dict[str, Any]) -> dict[tuple[str, str], list[tuple[Any, str]]]:
    return {
        (run["scenarioId"], run["selector"]): [
            (turn["step"], turn["publicText"]) for turn in run["turns"]
        ]
        for run in data["runs"]
    }


def compare(
    before: dict[str, Any], replay: dict[str, Any], after: dict[str, Any]
) -> dict[str, Any]:
    baseline = analyze(before)
    analyze(replay)
    current = analyze(after)
    if after.get("phase") != "5.6.3B":
        raise ValueError("Expected a 5.6.3B corpus")
    if published(before) != published(replay):
        raise ValueError("Historical published texts or inputs were not reproduced")
    old = published(before)
    new = published(after)
    if any(
        [step for step, _ in turns] != [step for step, _ in new[key]]
        for key, turns in old.items()
    ):
        raise ValueError("Player sequence differs from the frozen laboratory")
    current["phase"] = "5.6.3B"
    previous = {(run["scenarioId"], run["selector"]): run for run in baseline["runs"]}
    measures = (
        "turns",
        "identicalAdjacentReplies",
        "uniqueReplies",
        "paragraphOccurrences",
        "repeatedParagraphOccurrences",
        "publishedFallbacks",
        "largestSerializedRequestCharacters",
    )
    return {
        "phase": "5.6.3B",
        "evidenceKind": "OFFLINE_SCRIPTED_PUBLISHED_CORPUS_COMPARISON",
        "realProviderRequests": 0,
        "geminiLiteraryQualityCertified": False,
        "automaticLiteraryScores": None,
        "historicalPublishedTurnsReproduced": baseline["totalTurns"],
        "comparisonLimit": (
            "Same player sequence; B adds explicit reviewed bindings/current state "
            "and a scripted selector for prepared replies. Not a causal model eval."
        ),
        "runs": [
            {
                "scenarioId": b["scenarioId"],
                "selector": b["selector"],
                "before": {
                    key: previous[b["scenarioId"], b["selector"]][key]
                    for key in measures
                },
                "after": {key: b[key] for key in measures},
            }
            for b in current["runs"]
        ],
        "metrics": current,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--before", type=Path, required=True)
    parser.add_argument("--replay", type=Path, required=True)
    parser.add_argument("--after", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    inputs = {key: getattr(args, key) for key in ("before", "replay", "after")}
    result = compare(*(json.loads(path.read_text()) for path in inputs.values()))
    result["inputDigests"] = {
        key: hashlib.sha256(path.read_bytes()).hexdigest()
        for key, path in inputs.items()
    }
    with args.output.open("x") as handle:
        json.dump(result, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    print(json.dumps({"totalTurns": result["metrics"]["totalTurns"]}))


if __name__ == "__main__":
    main()
