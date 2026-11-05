from copy import deepcopy

import pytest

from app.evaluation.contextual_dialogue import compare
from tests.test_narrative_lab import complete_matrix


def test_comparison_requires_unchanged_historical_text_and_player_inputs():
    before = complete_matrix()
    replay = deepcopy(before)
    after = deepcopy(before)
    after["phase"] = "5.6.3B"
    after["runs"].reverse()
    after["runs"][0]["turns"][0]["publicText"] = "Nova réplica preparada"
    result = compare(before, replay, after)
    assert result["historicalPublishedTurnsReproduced"] == 24
    assert result["automaticLiteraryScores"] is None
    assert result["realProviderRequests"] == 0
    replay["runs"][0]["turns"][0]["publicText"] = "Histórico alterado"
    with pytest.raises(ValueError, match="Historical"):
        compare(before, replay, after)
    replay = deepcopy(before)
    after["runs"][0]["turns"][0]["step"]["text"] = "Outra pergunta"
    with pytest.raises(ValueError, match="Player sequence"):
        compare(before, replay, after)
