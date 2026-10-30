from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, RootModel


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Observe(StrictModel):
    kind: Literal["OBSERVE"]


class Scene(StrictModel):
    kind: Literal["SCENE"]
    optionId: UUID


class Attack(StrictModel):
    kind: Literal["ATTACK"]
    actorId: UUID
    targetId: UUID


class Proposal(RootModel[Observe | Scene | Attack]):
    @property
    def kind(self) -> str:
        return self.root.kind


class Narration(StrictModel):
    narrative: str = Field(min_length=1, max_length=12000)
    eventIds: list[UUID] = Field(max_length=100)


class TurnRequest(StrictModel):
    actionId: UUID
    campaignId: UUID
    sessionId: UUID
    stage: Literal["PROPOSE", "NARRATE"]
    interactionMode: Literal["SPEAK", "ACT", "THINK", "OUT_OF_CHARACTER"]
    playerMessage: str = Field(min_length=1, max_length=10000)
    context: dict[str, Any]
    confirmed: Narration | None


class Usage(StrictModel):
    provider: Literal["gemini", "groq"]
    model: str
    inputTokens: int = 0
    outputTokens: int = 0
    durationMs: int = 0
    error: str | None = None


class TurnResponse(StrictModel):
    proposal: Proposal | None = None
    narration: Narration | None = None
    usage: list[Usage] = Field(default_factory=list)
    error: str | None = None
