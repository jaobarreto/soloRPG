import io
import json
from uuid import uuid4

from app.evaluation.story_dialogue_replay import main


def test_production_fastapi_graph_uses_scripted_provider_and_projects_story_menu(
    monkeypatch, capsys
):
    request = {
        "actionId": str(uuid4()),
        "campaignId": str(uuid4()),
        "sessionId": str(uuid4()),
        "stage": "PROPOSE",
        "interactionMode": "SPEAK",
        "playerMessage": "Lior, podemos conversar?",
        "context": {
            "freeActions": True,
            "selection": {"version": 1, "information": []},
            "dialogue": [
                {
                    "name": "Lior",
                    "characterId": str(uuid4()),
                    "choices": [{"topic": "conversation", "act": "ANSWER"}],
                    "manifest": "PRIVATE_MANIFEST",
                }
            ],
            "adventure": {"gm": {"secret": "PRIVATE_GM"}},
        },
        "confirmed": None,
    }
    proposal = {
        "kind": "FREE",
        "intent": "TALK",
        "description": "Conversar",
        "expression": "QUESTION",
        "evidence": [],
        "target": {"type": "CHARACTER", "name": "Lior"},
        "tool": {"type": "DIALOGUE", "topic": "conversation", "act": "ANSWER"},
    }
    monkeypatch.setattr(
        "sys.stdin", io.StringIO(json.dumps({"request": request, "proposal": proposal}))
    )
    main()
    result = json.loads(capsys.readouterr().out)
    assert result["response"]["proposal"] == proposal
    assert len(result["prompts"]) == 1
    assert "PRIVATE" not in result["prompts"][0]
