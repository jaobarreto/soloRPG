import json

import pytest

from app.evaluation.narrative_lab import (
    ELIMINATORS,
    analyze,
    analyze_run,
    literary_eligibility,
    main,
)


@pytest.mark.parametrize("violation", ELIMINATORS)
def test_canonical_gate_cannot_be_compensated_by_a_literary_score(violation):
    assert literary_eligibility([violation])["eligible"] is False


def test_metrics_measure_published_text_not_rejected_drafts():
    run = {
        "scenarioId": "synthetic",
        "selector": "FIRST",
        "turns": [
            {
                "id": str(i),
                "step": {"text": "Pergunta diferente"},
                "publicText": "Iria — Ainda tenho dúvidas.\n\nComo deseja prosseguir?",
                "metadata": {"deterministicFallback": i == 1},
                "trace": [],
            }
            for i in range(3)
        ],
    }
    result = analyze_run(run)
    assert result["identicalAdjacentReplies"] == 2
    assert result["repeatedParagraphOccurrences"] == 4
    assert result["closingQuestions"] == {"Como deseja prosseguir?": 3}
    assert result["publishedFallbacks"] == 1
    assert result["canonicalGate"]["eligible"]


def test_missing_or_unlabelled_runs_are_not_mistaken_for_a_completed_evaluation():
    with pytest.raises(ValueError):
        analyze({"evidenceKind": "REAL_GEMINI"})
    with pytest.raises(ValueError):
        analyze(
            {
                "evidenceKind": (
                    "SCRIPTED_PRODUCTION_GRAPH_HTTP_AND_DISPOSABLE_POSTGRES"
                ),
                "complete": False,
                "runs": [],
            }
        )
    with pytest.raises(ValueError):
        literary_eligibility(["UNREVIEWED_LABEL"])


def complete_matrix():
    return {
        "evidenceKind": "SCRIPTED_PRODUCTION_GRAPH_HTTP_AND_DISPOSABLE_POSTGRES",
        "complete": True,
        "eliminatoryControlsValidated": True,
        "runs": [
            {
                "scenarioId": f"563A-{i:02}",
                "selector": selector,
                "turns": [
                    {
                        "id": str(n),
                        "step": {"text": "Mensagem"},
                        "publicText": "Texto",
                        "metadata": {},
                        "trace": [],
                    }
                    for n in range(2)
                ],
            }
            for i in range(1, 7)
            for selector in ("FIRST", "VARIED")
        ],
    }


def test_complete_scripted_matrix_never_produces_gemini_quality_scores():
    data = complete_matrix()
    result = analyze(data)
    assert result["geminiLiteraryQualityCertified"] is False
    assert result["automaticLiteraryScores"] is None
    data["runs"][0] = data["runs"][1]
    with pytest.raises(ValueError):
        analyze(data)


def test_cli_writes_metrics_once_without_overwriting_evidence(monkeypatch, tmp_path):
    source = tmp_path / "input.json"
    target = tmp_path / "output.json"
    source.write_text(json.dumps(complete_matrix()))
    monkeypatch.setattr(
        "sys.argv", ["narrative_lab", "--input", str(source), "--output", str(target)]
    )
    main()
    before = target.read_bytes()
    assert json.loads(before)["automaticLiteraryScores"] is None
    with pytest.raises(FileExistsError):
        main()
    assert target.read_bytes() == before
