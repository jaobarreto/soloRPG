from typing import Annotated, Any, Literal, Self
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, RootModel, model_validator


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


class Shield(StrictModel):
    arcanum: Literal["psychic-shield"]
    characterId: UUID
    raised: bool


class Sight(StrictModel):
    arcanum: Literal["second-sight"]
    characterId: UUID
    contextId: UUID | None = None


class Contact(StrictModel):
    arcanum: Literal["psychic-contact"]
    characterId: UUID
    targetId: UUID
    tradition: Literal["PSYCHIC", "ANIMISM"]


class BodyControl(StrictModel):
    arcanum: Literal["body-control"]
    characterId: UUID
    targetId: UUID
    tradition: Literal["HEALING", "MEDITATIVE", "ANIMISM"]
    use: Literal[
        "SLEEP",
        "DIFFICULT_SLEEP",
        "HALF_BREATHING",
        "QUARTER_BREATHING",
        "IGNORE_PAIN",
        "BODY_AWARENESS",
        "FEIGN_DEATH",
    ]


class MoveObject(StrictModel):
    arcanum: Literal["move-object"]
    characterId: UUID
    contextId: UUID
    fatigue: bool


class Wind(StrictModel):
    arcanum: Literal["wind-shaping"]
    characterId: UUID
    contextId: UUID
    category: int = Field(ge=0, le=3, strict=True)


class UseArcanum(StrictModel):
    type: Literal["ARCANA_USE"]
    input: Shield | Sight | Contact | BodyControl | MoveObject | Wind


class Cure(StrictModel):
    type: Literal["CURE"]
    characterId: UUID
    targetId: UUID


class EndArcanum(StrictModel):
    type: Literal["ARCANA_END"]
    characterId: UUID
    effectId: UUID


class Rest(StrictModel):
    type: Literal["REST"]
    characterId: UUID
    kind: Literal["BREATHER", "LIGHT_REST", "SLEEP"]
    sustenanceConfirmed: Literal[True] | None = None


class RitualAttempt(StrictModel):
    action: Literal["RITUAL_ATTEMPT"]
    characterId: UUID
    task: Literal["CANDLES", "POEM", "SHAPING"]
    benefit: Literal["NONE", "EGG", "HAINT_TARGET", "HAINT_DAMAGE"]
    declineStunts: Literal[True]


class RitualStop(StrictModel):
    action: Literal["RITUAL_STOP"]
    characterId: UUID


class AdventureAction(StrictModel):
    type: Literal["ADVENTURE_ACTION"]
    input: RitualAttempt | RitualStop


class Mechanic(StrictModel):
    kind: Literal["MECHANIC"]
    command: UseArcanum | Cure | EndArcanum | Rest | AdventureAction


class NamedTarget(StrictModel):
    type: Literal["CHARACTER", "WORLD", "ITEM"]
    name: str = Field(min_length=1, max_length=200)


class DialogueTool(StrictModel):
    type: Literal["DIALOGUE"]
    topic: str | None = Field(
        default=None,
        min_length=1,
        max_length=100,
        exclude_if=lambda value: value is None,
    )
    act: (
        Literal[
            "ANSWER",
            "DOUBT",
            "DISAGREE",
            "CLARIFY",
            "CAUTION",
            "RESUME",
            "REFUSE",
            "UNKNOWN",
        ]
        | None
    ) = Field(default=None, exclude_if=lambda value: value is None)


class ObserveTool(StrictModel):
    type: Literal["OBSERVE"]


class AdjudicateTool(StrictModel):
    type: Literal["ADJUDICATE"]


class QueryTool(StrictModel):
    type: Literal["QUERY"]
    subject: Literal[
        "CHARACTER", "LOCATION", "INVENTORY", "RULES", "MEMORY", "OBJECTIVES"
    ]


class ClarifyTool(StrictModel):
    type: Literal["CLARIFY"]
    question: str = Field(min_length=1, max_length=500)


class PreparedCheckTool(StrictModel):
    type: Literal["PREPARED_CHECK"]
    capability: str = Field(min_length=1, max_length=3000)


EXPRESSION_DESCRIPTION = (
    "Ato comunicativo da mensagem inteira, independente de intent, tool "
    "e interactionMode. "
    "QUESTION: pedido de informação, inclusive indireto e sem interrogação. "
    "DIRECT: declaração ou comando atual, inclusive comando de consulta. "
    "HYPOTHETICAL: possibilidade não executada; NEGATED: ação recusada; "
    "QUOTED: conteúdo atribuído; COMPOUND: tentativas distintas. "
    "O canal ACT e a descrição operacional não transformam pergunta em DIRECT."
)


class ArcanaTool(StrictModel):
    type: Literal["ARCANA"]
    arcanum: Literal[
        "psychic-shield",
        "second-sight",
        "psychic-contact",
        "cure",
        "body-control",
        "move-object",
        "wind-shaping",
    ]
    raised: bool | None = Field(
        default=None,
        description=(
            "Somente psychic-shield: erguer=true ou baixar=false, se declarado. "
            "Nos demais arcanos omitir ou null."
        ),
    )
    tradition: Literal["PSYCHIC", "ANIMISM", "HEALING", "MEDITATIVE"] | None = Field(
        default=None,
        description=(
            "Somente psychic-contact ou body-control, se declarada. "
            "Não deduzir tradição pelo nome do arcano ou pela ficha. "
            "Nos demais omitir ou null."
        ),
    )
    use: (
        Literal[
            "SLEEP",
            "DIFFICULT_SLEEP",
            "HALF_BREATHING",
            "QUARTER_BREATHING",
            "IGNORE_PAIN",
            "BODY_AWARENESS",
            "FEIGN_DEATH",
        ]
        | None
    ) = Field(
        default=None,
        description=(
            "Somente body-control: uso expressamente escolhido. "
            "Nos demais arcanos omitir ou null."
        ),
    )
    fatigue: bool | None = Field(
        default=None,
        description=(
            "Somente move-object: opção voluntária expressamente escolhida. "
            "Não é fadiga calculada pelo motor. Nos demais omitir ou null."
        ),
    )
    category: int | None = Field(
        default=None,
        ge=0,
        le=3,
        strict=True,
        description=(
            "Somente wind-shaping: categoria desejada expressamente escolhida. "
            "Não é a categoria atual do contexto. Nos demais omitir ou null."
        ),
    )


class CombatTool(StrictModel):
    type: Literal["COMBAT"]
    action: Literal["ATTACK", "DEFEND"]


class RestTool(StrictModel):
    type: Literal["REST"]
    kind: Literal["BREATHER", "LIGHT_REST", "SLEEP"]
    sustenanceConfirmed: Literal[True] | None = None


class WaitTool(StrictModel):
    type: Literal["WAIT"]
    minutes: int = Field(ge=1, le=60, strict=True)


EvidenceKey = Annotated[str, Field(min_length=1, max_length=80)]


class FreeAction(StrictModel):
    kind: Literal["FREE"]
    intent: Literal[
        "TALK",
        "QUERY",
        "INVESTIGATE",
        "OBSERVE",
        "EXPLORE",
        "MOVE",
        "ARCANA",
        "ATTACK",
        "DEFEND",
        "INTERACT",
        "USE_ITEM",
        "HELP",
        "REST",
        "WAIT",
        "SOCIAL",
        "REFUSE",
        "NEGOTIATE",
        "LIE",
        "OOC",
        "CORRECT",
        "THINK",
        "OTHER",
    ]
    description: str = Field(min_length=1, max_length=1000)
    target: NamedTarget | None
    expression: (
        Literal["DIRECT", "QUESTION", "HYPOTHETICAL", "NEGATED", "QUOTED", "COMPOUND"]
        | None
    ) = Field(default=None, description=EXPRESSION_DESCRIPTION)
    evidence: list[EvidenceKey] | None = Field(default=None, max_length=8)
    tool: (
        DialogueTool
        | ObserveTool
        | QueryTool
        | ClarifyTool
        | AdjudicateTool
        | PreparedCheckTool
        | ArcanaTool
        | CombatTool
        | RestTool
        | WaitTool
    )


class SelectedFreeAction(FreeAction):
    """New proposals carry the speech act and server-owned information selectors."""

    expression: Literal[
        "DIRECT", "QUESTION", "HYPOTHETICAL", "NEGATED", "QUOTED", "COMPOUND"
    ] = Field(description=EXPRESSION_DESCRIPTION)
    evidence: list[EvidenceKey] = Field(max_length=8)


class Proposal(RootModel[Observe | Scene | Attack | Mechanic | FreeAction]):
    @property
    def kind(self) -> str:
        return self.root.kind


class NarrativeBeat(StrictModel):
    kind: Literal["RESULT", "ATMOSPHERE", "DIALOGUE", "QUESTION", "OOC"]
    speakerId: UUID | None
    text: str = Field(min_length=1, max_length=3000)
    factIds: list[UUID] = Field(max_length=100)


class Narration(StrictModel):
    narrative: str = Field(min_length=1, max_length=12000)
    eventIds: list[UUID] = Field(max_length=100)
    beats: list[NarrativeBeat] | None = Field(default=None, min_length=1, max_length=8)


class ResolvedMention(StrictModel):
    type: Literal["CHARACTER", "ITEM", "WORLD"]
    entityId: UUID
    label: str = Field(min_length=1, max_length=200)
    start: int = Field(ge=0, le=10000, strict=True)
    end: int = Field(ge=1, le=10000, strict=True)
    literal: str = Field(min_length=2, max_length=201)


class TurnRequest(StrictModel):
    actionId: UUID
    campaignId: UUID
    sessionId: UUID
    stage: Literal["PROPOSE", "NARRATE"]
    interactionMode: Literal["SPEAK", "ACT", "THINK", "OUT_OF_CHARACTER", "REQUEST_CHECK", "ROLL_RESULT"]
    playerMessage: str = Field(min_length=1, max_length=10000)
    context: dict[str, Any]
    confirmed: Narration | None

    @model_validator(mode="after")
    def validate_mentions(self) -> Self:
        raw = self.context.get("mentions", [])
        if not isinstance(raw, list) or len(raw) > 30:
            raise ValueError("Invalid mention list")
        mentions = [ResolvedMention.model_validate(item) for item in raw]
        encoded = self.playerMessage.encode("utf-16-le")
        end = 0
        for mention in sorted(mentions, key=lambda item: item.start):
            symbol = "@" if mention.type == "CHARACTER" else "#"
            if (
                mention.start < end
                or mention.end <= mention.start
                or mention.end * 2 > len(encoded)
                or mention.literal != symbol + mention.label
                or encoded[mention.start * 2 : mention.end * 2]
                != mention.literal.encode("utf-16-le")
            ):
                raise ValueError("Inconsistent mention offsets")
            end = mention.end
        return self


class Usage(StrictModel):
    provider: Literal["gemini", "groq"]
    model: str
    inputTokens: int = Field(default=0, ge=0)
    outputTokens: int = Field(default=0, ge=0)
    durationMs: int = Field(default=0, ge=0)
    inputCharacters: int = Field(default=0, ge=0)
    totalTokens: int | None = Field(default=None, ge=0)
    usageReported: bool = False
    error: str | None = None


class TurnResponse(StrictModel):
    proposal: Proposal | None = None
    narration: Narration | None = None
    usage: list[Usage] = Field(default_factory=list)
    error: str | None = None
