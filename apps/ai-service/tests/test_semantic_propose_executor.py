import asyncio
import json

import httpx
import pytest

from app.core.config import Settings
from app.evaluation import semantic_propose_executor as ex


def frozen():
    digest = ex.sha((ex.ROOT / ex.MANIFEST).read_bytes())
    return digest, ex.verify(ex.ROOT, digest)


def settings():
    return Settings(
        _env_file=None,
        llm_provider="gemini",
        gemini_model=ex.MODEL,
        gemini_api_key="synthetic-no-credential",
        enable_provider_fallback=False,
        ai_free_tier_confirmed=False,
    )


@pytest.mark.parametrize(
    "failure", [None, "semantic", "invalid", "model", "rate", "billing"]
)
def test_round_reuses_production_and_stops(tmp_path, failure):
    digest, plan = frozen()
    seen = []

    def transport(request):
        case = plan["cases"][len(seen)]
        seen.append(case["caseId"])
        body = json.loads(request.content)
        prompt = json.loads(
            body["contents"][0]["parts"][0]["text"].removeprefix("DADOS:\n")
        )
        assert prompt["stage"] == "PROPOSE"
        assert prompt["playerMessage"] == case["proposeRequest"]["playerMessage"]
        assert "ato da réplica do NPC" in body["systemInstruction"]["parts"][0]["text"]
        assert body["generationConfig"]["maxOutputTokens"] == 700
        assert not any(
            k in json.dumps(prompt)
            for k in (
                "expectedProposal",
                "expectedResolution",
                "reviewCriterion",
                "alsoAcceptIntent",
            )
        )
        output = case["expectedProposal"]
        if failure == "semantic":
            output = {
                **output,
                "expression": "DIRECT",
                "tool": {**output["tool"], "act": "CLARIFY"},
            }
        if failure in {"rate", "billing"}:
            status = 429 if failure == "rate" else 403
            return httpx.Response(
                status, json={"error": {"code": status, "message": failure}}
            )
        return httpx.Response(
            200,
            json={
                "modelVersion": ex.MODEL if failure != "model" else "unexpected",
                "candidates": [
                    {
                        "content": {
                            "role": "model",
                            "parts": [
                                {
                                    "text": "not JSON"
                                    if failure == "invalid"
                                    else json.dumps(output)
                                }
                            ],
                        },
                        "finishReason": "STOP",
                    }
                ],
            },
        )

    result = asyncio.run(
        ex.run_round(
            ex.ROOT,
            digest,
            plan["roundId"],
            settings=settings(),
            approval={},
            transport=transport,
            offline_directory=tmp_path / "output",
        )
    )
    expected = {
        None: None,
        "semantic": "SEMANTIC_FAILURE_OPERATOR_REVIEW_REQUIRED",
        "invalid": "INVALID_RESPONSE",
        "model": "UNEXPECTED_MODEL",
        "rate": "RATE_LIMIT",
        "billing": "BILLING_OR_FINANCIAL_UNCERTAINTY",
    }
    assert result.get("stopReason") == expected[failure]
    assert result["realProviderRequests"] == 0
    assert len(seen) == result["reservedRequests"] == (4 if failure is None else 1)
    assert result["attempts"][0]["inputTokens"] is None
    if failure == "semantic":
        first = result["attempts"][0]
        assert json.loads(first["rawText"])["expression"] == "DIRECT"
        assert (
            first["nest"]["resolution"]["reason"] == "UNAUTHORIZED_DIALOGUE_SELECTION"
        )
        assert first["selection"]["differentFields"] == ["expression", "tool.act"]
    if failure is None:
        assert result["attempts"][2]["nest"]["resolution"]["category"] == "CLARIFY"
        assert (
            result["attempts"][3]["nest"]["resolution"]["dialogueOrigin"]
            == "STORY_CARD"
        )
        with pytest.raises(FileExistsError):
            asyncio.run(
                ex.run_round(
                    ex.ROOT,
                    digest,
                    plan["roundId"],
                    settings=settings(),
                    approval={},
                    transport=transport,
                    offline_directory=tmp_path / "output",
                )
            )
        assert len(seen) == 4


def test_gates_and_budget_before_provider(monkeypatch):
    digest, plan = frozen()
    monkeypatch.setattr(
        ex, "ProviderRouter", lambda *a, **k: pytest.fail("unexpected provider")
    )
    with pytest.raises(ex.Halt, match="NEW_ROUND_AUTHORIZATION_REQUIRED"):
        asyncio.run(
            ex.run_round(
                ex.ROOT, digest, plan["roundId"], settings=settings(), approval={}
            )
        )
    with pytest.raises(ex.Halt, match="FINANCIAL_CONFIRMATION_REQUIRED"):
        asyncio.run(
            ex.run_round(
                ex.ROOT,
                digest,
                plan["roundId"],
                settings=settings(),
                approval={"roundId": plan["roundId"], "authorized": True},
            )
        )
    with pytest.raises(ex.Halt, match="MANIFEST_MISMATCH"):
        ex.verify(ex.ROOT, "0" * 64)
    budget = ex.ProposeBudget()
    with pytest.raises(ex.Halt, match="REQUEST_LIMIT"):
        budget.reserve("C1-2", "NARRATE", 1, 700)
    with pytest.raises(ex.Halt, match="REQUEST_LIMIT"):
        budget.reserve("C1-2", "PROPOSE", 1, 701)
    for case in ex.CASE_IDS:
        budget.reserve(case, "PROPOSE", 1, 700)
    with pytest.raises(ex.Halt, match="OUT_OF_ORDER_SLOT"):
        budget.reserve("SP-4", "PROPOSE", 1, 700)
