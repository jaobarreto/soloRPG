from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app.narrative.schemas import (
    FreeAction,
    Proposal,
    SelectedFreeAction,
    TurnRequest,
    TurnResponse,
)
from app.providers.base import LLMProvider
from app.providers.errors import ProviderError


class GameGraphState(TypedDict):
    request: TurnRequest
    response: TurnResponse


async def run_turn(request: TurnRequest, provider: LLMProvider) -> TurnResponse:
    async def interpret(state: GameGraphState) -> dict[str, TurnResponse]:
        req = state["request"]
        adventure = req.context.get("adventure")
        gm = adventure.get("gm") if isinstance(adventure, dict) else None
        adjudication = isinstance(gm, dict) and gm.get("localAdjudicationRequired")
        selected = req.context.get("selectedMechanic")
        if req.interactionMode == "ACT" and selected:
            proposal = Proposal.model_validate(
                {"kind": "MECHANIC", "command": selected}
            )
        elif (
            req.interactionMode in ("THINK", "REQUEST_CHECK", "ROLL_RESULT")
            or (
                req.interactionMode == "OUT_OF_CHARACTER"
                and not req.context.get("freeActions")
            )
            or (adjudication and req.context.get("selectedOptionId"))
        ):
            proposal = Proposal.model_validate({"kind": "OBSERVE"})
        else:
            try:
                if req.context.get("freeActions") and not req.context.get(
                    "selectedOptionId"
                ):
                    from app.narrative.selection import planner_request

                    free = await provider.generate_structured(
                        "DADOS:\n" + planner_request(req).model_dump_json(),
                        SelectedFreeAction
                        if req.context.get("selection")
                        else FreeAction,
                        max_output_tokens=700,
                    )
                    proposal = Proposal.model_validate(free.model_dump())
                else:
                    proposal = await provider.generate_structured(
                        "DADOS:\n" + req.model_dump_json(),
                        Proposal,
                        max_output_tokens=700,
                    )
            except ProviderError as exc:
                if (
                    exc.code != "INVALID_RESPONSE"
                    or not req.context.get("freeActions")
                    or req.context.get("selectedOptionId")
                ):
                    raise
                # No parsed intent is safe to execute. Ask, never guess; keep the
                # failed attempt in usage without spending an automatic repair call.
                proposal = Proposal.model_validate(
                    {
                        "kind": "FREE",
                        "intent": "OTHER",
                        "description": "Esclarecer interpretação inválida.",
                        "target": None,
                        "tool": {
                            "type": "CLARIFY",
                            "question": "Pode esclarecer sua intenção?",
                        },
                    }
                )
        return {"response": TurnResponse(proposal=proposal)}

    async def narrate(state: GameGraphState) -> dict[str, TurnResponse]:
        confirmed = state["request"].confirmed
        if confirmed is None:
            raise ValueError("Confirmed outcome required")
        rendering = state["request"].context.get("rendering")
        if not isinstance(rendering, dict) or rendering.get("category") in (
            "CLARIFY",
            "ADJUDICATE",
            "THINK",
            "OOC",
            "QUERY",
            "OBSERVE",
        ):
            return {"response": TurnResponse(narration=confirmed)}
        from app.narrative.schemas import Narration

        try:
            narration = await provider.generate_structured(
                "DADOS:\n" + state["request"].model_dump_json(),
                Narration,
                max_output_tokens=1200,
            )
        except ProviderError as exc:
            if exc.code != "INVALID_RESPONSE":
                raise
            return {"response": TurnResponse(narration=confirmed)}
        if narration.beats:
            # The typed beats are the single source of rendered text. Model-added
            # quotation marks/bullets in the redundant string must not create a
            # second competing narrative; NestJS verifies this assembly again.
            narration = narration.model_copy(
                update={"narrative": "\n\n".join(beat.text for beat in narration.beats)}
            )
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
