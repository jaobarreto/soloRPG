import json
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app.narrative.prompts import NARRATOR
from app.narrative.schemas import Narration, Proposal, TurnRequest, TurnResponse
from app.providers.base import LLMProvider


class GameGraphState(TypedDict):
    request: TurnRequest
    response: TurnResponse


async def run_turn(request: TurnRequest, provider: LLMProvider) -> TurnResponse:
    async def interpret(state: GameGraphState) -> dict[str, TurnResponse]:
        req = state["request"]
        if req.interactionMode in ("THINK", "OUT_OF_CHARACTER"):
            proposal = Proposal.model_validate({"kind": "OBSERVE"})
        else:
            proposal = await provider.generate_structured(
                "DADOS:\n" + req.model_dump_json(),
                Proposal,
                max_output_tokens=700,
            )
        return {"response": TurnResponse(proposal=proposal)}

    async def narrate(state: GameGraphState) -> dict[str, TurnResponse]:
        confirmed = state["request"].confirmed
        if confirmed is None:
            raise ValueError("Confirmed outcome required")
        narration = await provider.generate_structured(
            NARRATOR
            + "\nDADOS:\n"
            + json.dumps(confirmed.model_dump(mode="json"), ensure_ascii=False),
            Narration,
            max_output_tokens=1800,
        )
        # Never turn prose into commands or silently amend the committed receipt.
        if narration != confirmed:
            narration = confirmed
        return {"response": TurnResponse(narration=narration)}

    graph = StateGraph(GameGraphState)
    graph.add_node("interpret_and_propose", interpret)
    graph.add_node("narrate_confirmed", narrate)
    graph.add_conditional_edges(
        START,
        lambda state: (
            "interpret_and_propose"
            if state["request"].stage == "PROPOSE"
            else "narrate_confirmed"
        ),
    )
    graph.add_edge("interpret_and_propose", END)
    graph.add_edge("narrate_confirmed", END)
    result = await graph.compile().ainvoke(
        {"request": request, "response": TurnResponse()}
    )
    return result["response"]  # type: ignore[no-any-return]
