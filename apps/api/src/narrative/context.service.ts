import { adventureContext } from '../adventures/core/scenes/scene-state';
import { AdventureRegistry } from '../adventures/core/registry/registry';
import { adventureProgress } from '../adventures/core/state/state';
import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import {
  and,
  desc,
  eq,
  gte,
  inArray,
  lte,
  max,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service';
import * as g from '../database/game-schema';
import * as n from '../database/narrative-schema';
import {
  campaigns,
  campaignSessions,
  sessionMessages,
} from '../database/schema';
import { publicationChoices, type RenderingContext } from './rendering';
import { selectionContext } from './information';
import { storyCardDialogue } from './story-card-dialogue';
import {
  dialogueBindingSchema,
  type DialogueMenu,
  type DialogueSelection,
} from '@solo-rpg/shared-contracts';
import {
  authorizeDialogue,
  type DialogueSpeaker,
  type DialogueSource,
} from './dialogue-content';

type Reader = DatabaseService['db'] | DatabaseTransaction;
@Injectable()
export class NarrativeContextService {
  constructor(
    private readonly database: DatabaseService,
    private readonly adventures: AdventureRegistry,
  ) {}
  private async dialogueReplies(
    campaignId: string,
    sessionId: string,
    speaker: DialogueSpeaker & { knowledge: { eventId: string }[] },
    tx: Reader,
  ) {
    const [prepared] = await tx
      .select()
      .from(n.sessionPlans)
      .where(eq(n.sessionPlans.sessionId, sessionId));
    const bindings =
      prepared?.plan.dialogue?.filter((b) => b.characterId === speaker.id) ??
      [];
    if (bindings.length !== 1)
      return { enabled: bindings.length > 0, replies: [] };
    const parsedBinding = dialogueBindingSchema.safeParse(bindings[0]);
    if (!parsedBinding.success) return { enabled: true, replies: [] };
    const binding = parsedBinding.data;
    const knowledgeIds = binding.sources
      .filter((s) => s.kind === 'KNOWLEDGE')
      .map((s) => s.referenceId)
      .filter((id) => speaker.knowledge.some((k) => k.eventId === id));
    const worldIds = binding.sources
      .filter((s) => s.kind === 'PUBLIC')
      .map((s) => s.referenceId);
    const sources: DialogueSource[] = [];
    if (knowledgeIds.length) {
      const knowledge = await tx
        .select({
          referenceId: g.gameEvents.id,
          characterId: n.characterKnowledge.characterId,
          description: g.gameEvents.description,
          source: n.characterKnowledge.source,
          visibility: g.gameEvents.visibility,
          eventType: g.gameEvents.type,
          participantId: g.eventParticipants.characterId,
        })
        .from(n.characterKnowledge)
        .innerJoin(
          g.gameEvents,
          eq(n.characterKnowledge.eventId, g.gameEvents.id),
        )
        .leftJoin(
          g.eventParticipants,
          and(
            eq(g.eventParticipants.eventId, g.gameEvents.id),
            eq(g.eventParticipants.characterId, speaker.id),
          ),
        )
        .where(
          and(
            eq(n.characterKnowledge.campaignId, campaignId),
            eq(g.gameEvents.campaignId, campaignId),
            eq(n.characterKnowledge.characterId, speaker.id),
            inArray(g.gameEvents.id, knowledgeIds),
            eq(g.gameEvents.visibility, 'PUBLIC'),
          ),
        );
      sources.push(
        ...knowledge.map((k) => ({
          ...k,
          kind: 'KNOWLEDGE' as const,
          participants: k.participantId ? [k.participantId] : [],
        })),
      );
    }
    if (worldIds.length) {
      const world = await tx
        .select({
          referenceId: g.worldEntities.id,
          description: g.worldEntities.description,
          visibility: g.worldEntities.visibility,
          accessible: g.worldEntities.accessible,
        })
        .from(g.worldEntities)
        .where(
          and(
            eq(g.worldEntities.campaignId, campaignId),
            inArray(g.worldEntities.id, worldIds),
            eq(g.worldEntities.visibility, 'PUBLIC'),
            eq(g.worldEntities.accessible, true),
          ),
        );
      sources.push(...world.map((w) => ({ ...w, kind: 'PUBLIC' as const })));
    }
    return {
      enabled: true,
      replies: authorizeDialogue(binding, speaker, sources),
    };
  }
  async revision(campaignId: string, sessionId: string, tx: Reader) {
    const [events] = await tx
      .select({ last: max(g.gameEvents.sequence) })
      .from(g.gameEvents)
      .where(eq(g.gameEvents.campaignId, campaignId));
    const [message] = await tx
      .select({ last: max(sessionMessages.sequenceNumber) })
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, sessionId));
    const [session] = await tx
      .select()
      .from(campaignSessions)
      .where(eq(campaignSessions.id, sessionId));
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    return createHash('sha256')
      .update(JSON.stringify({ events, message, session, campaign }))
      .digest('hex');
  }
  async build(
    campaignId: string,
    sessionId: string,
    tx: Reader = this.database.db,
    excludeMessageId?: string,
  ) {
    const [campaign] = await tx
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaignId));
    const [session] = await tx
      .select()
      .from(campaignSessions)
      .where(eq(campaignSessions.id, sessionId));
    const [prepared] = await tx
      .select()
      .from(n.sessionPlans)
      .where(eq(n.sessionPlans.sessionId, sessionId));
    const plan = prepared?.plan ?? null;
    const { context: adventure, presentParty: present } =
      await adventureContext(
        campaignId,
        sessionId,
        tx,
        this.adventures,
        plan?.presentCharacterIds,
      );
    const characters = await tx
      .select()
      .from(g.characters)
      .where(
        and(
          eq(g.characters.campaignId, campaignId),
          eq(g.characters.known, true),
          sql`(${g.characters.kind} = 'PROTAGONIST' OR ${present.length ? inArray(g.characters.id, present) : sql`false`})`,
        ),
      )
      .limit(31);
    const ids = characters.map((c) => c.id);
    const vitals = ids.length
      ? await tx
          .select()
          .from(g.characterVitals)
          .where(inArray(g.characterVitals.characterId, ids))
      : [];
    const abilities = ids.length
      ? await tx
          .select()
          .from(g.characterAbilities)
          .where(inArray(g.characterAbilities.characterId, ids))
      : [];
    const features = ids.length
      ? await tx
          .select({
            characterId: g.characterFeatures.characterId,
            ruleId: g.ruleReferences.id,
            name: g.ruleReferences.name,
            status: g.ruleReferences.status,
            degree: g.characterFeatures.degree,
          })
          .from(g.characterFeatures)
          .innerJoin(
            g.ruleReferences,
            eq(g.characterFeatures.ruleId, g.ruleReferences.id),
          )
          .where(inArray(g.characterFeatures.characterId, ids))
      : [];
    const [combat] = await tx
      .select()
      .from(g.combatEncounters)
      .where(
        and(
          eq(g.combatEncounters.campaignId, campaignId),
          eq(g.combatEncounters.sessionId, sessionId),
          eq(g.combatEncounters.status, 'ACTIVE'),
          inArray(g.combatEncounters.visibility, ['PUBLIC', 'PLAYER_ONLY']),
        ),
      );
    const members = combat
      ? await tx
          .select({
            characterId: g.combatMembers.characterId,
            ordinal: g.combatMembers.ordinal,
            x: g.combatMembers.x,
            y: g.combatMembers.y,
            majorUsed: g.combatMembers.majorUsed,
            minorUsed: g.combatMembers.minorUsed,
          })
          .from(g.combatMembers)
          .where(eq(g.combatMembers.encounterId, combat.id))
          .orderBy(g.combatMembers.ordinal)
      : [];
    const resources = ids.length
      ? await tx
          .select()
          .from(g.characterResources)
          .where(inArray(g.characterResources.characterId, ids))
      : [];
    const conditions = ids.length
      ? await tx
          .select({
            characterId: g.characterConditions.characterId,
            name: g.characterConditions.name,
          })
          .from(g.characterConditions)
          .where(
            and(
              inArray(g.characterConditions.characterId, ids),
              inArray(g.characterConditions.visibility, [
                'PUBLIC',
                'PLAYER_ONLY',
              ]),
            ),
          )
      : [];
    const inventory = ids.length
      ? await tx
          .select({
            characterId: g.inventory.characterId,
            itemId: g.gameItems.id,
            name: g.gameItems.name,
            description: g.gameItems.description,
            quantity: g.inventory.quantity,
          })
          .from(g.inventory)
          .innerJoin(g.gameItems, eq(g.inventory.itemId, g.gameItems.id))
          .where(
            and(
              inArray(g.inventory.characterId, ids),
              inArray(g.gameItems.visibility, ['PUBLIC', 'PLAYER_ONLY']),
              gte(g.inventory.quantity, 1),
            ),
          )
      : [];
    const memories = await tx
      .select({
        id: g.gameEvents.id,
        description: g.gameEvents.description,
        type: g.gameEvents.type,
      })
      .from(g.gameEvents)
      .where(
        and(
          eq(g.gameEvents.campaignId, campaignId),
          inArray(g.gameEvents.visibility, ['PUBLIC', 'PLAYER_ONLY']),
        ),
      )
      .orderBy(desc(g.gameEvents.sequence))
      .limit(20);
    const rankedKnowledge = tx
      .select({
        characterId: n.characterKnowledge.characterId,
        eventId: g.gameEvents.id,
        description: g.gameEvents.description,
        importance: n.characterKnowledge.importance,
        source: n.characterKnowledge.source,
        sequence: g.gameEvents.sequence,
        rank: sql<number>`row_number() OVER (PARTITION BY ${n.characterKnowledge.characterId} ORDER BY ${n.characterKnowledge.importance} DESC, ${g.gameEvents.sequence} DESC)`.as(
          'rank',
        ),
      })
      .from(n.characterKnowledge)
      .innerJoin(
        g.gameEvents,
        eq(n.characterKnowledge.eventId, g.gameEvents.id),
      )
      .where(
        and(
          eq(n.characterKnowledge.campaignId, campaignId),
          ids.length
            ? inArray(n.characterKnowledge.characterId, ids)
            : sql`false`,
          inArray(g.gameEvents.visibility, ['PUBLIC', 'PLAYER_ONLY']),
        ),
      )
      .as('ranked_knowledge');
    // Critical facts must not compete with another NPC for a global top-N.
    // Retain every critical association; oversized contexts are rejected rather
    // than silently stripped of a conflict. Other memories are capped per NPC.
    const knowledge = ids.length
      ? await tx
          .select({
            characterId: rankedKnowledge.characterId,
            eventId: rankedKnowledge.eventId,
            description: rankedKnowledge.description,
            importance: rankedKnowledge.importance,
            source: rankedKnowledge.source,
          })
          .from(rankedKnowledge)
          .where(
            or(
              gte(rankedKnowledge.importance, 90),
              lte(rankedKnowledge.rank, 8),
            ),
          )
          .orderBy(
            desc(rankedKnowledge.importance),
            desc(rankedKnowledge.sequence),
          )
      : [];
    const relationships = await tx
      .select()
      .from(g.relationships)
      .where(
        and(
          eq(g.relationships.campaignId, campaignId),
          ids.length
            ? inArray(g.relationships.fromCharacterId, ids)
            : sql`false`,
          ids.length ? inArray(g.relationships.toCharacterId, ids) : sql`false`,
          inArray(g.relationships.visibility, ['PUBLIC', 'PLAYER_ONLY']),
        ),
      )
      .orderBy(
        g.relationships.fromCharacterId,
        g.relationships.toCharacterId,
        g.relationships.metric,
      );
    const recent = await tx
      .select({
        role: sessionMessages.role,
        mode: sessionMessages.interactionMode,
        content: sessionMessages.content,
      })
      .from(sessionMessages)
      .where(
        and(
          eq(sessionMessages.sessionId, sessionId),
          sql`(${sessionMessages.interactionMode} IS NULL OR ${sessionMessages.interactionMode} NOT IN ('THINK','OUT_OF_CHARACTER','REQUEST_CHECK','ROLL_RESULT'))`,
          sql`COALESCE(${sessionMessages.metadata}->>'queued','false') <> 'true'`,
          sql`COALESCE(${sessionMessages.metadata}->>'clarification','false') <> 'true'`,
          sql`COALESCE(${sessionMessages.metadata}->>'batchContinuation','false') <> 'true'`,
          excludeMessageId
            ? ne(sessionMessages.id, excludeMessageId)
            : undefined,
        ),
      )
      .orderBy(desc(sessionMessages.sequenceNumber))
      .limit(12);
    const previous = await tx
      .select({
        number: campaignSessions.sessionNumber,
        summary: campaignSessions.summary,
      })
      .from(campaignSessions)
      .where(
        and(
          eq(campaignSessions.campaignId, campaignId),
          eq(campaignSessions.status, 'COMPLETED'),
        ),
      )
      .orderBy(desc(campaignSessions.sessionNumber))
      .limit(2);
    const relevantRuleIds = [
      ...new Set([
        ...features.map((f) => f.ruleId),
        ...(plan?.options.flatMap((o) =>
          o.check?.focusId ? [o.check.focusId] : [],
        ) ?? []),
      ]),
    ];
    const rules = await tx
      .select()
      .from(g.ruleReferences)
      .where(
        or(
          relevantRuleIds.length
            ? inArray(g.ruleReferences.id, relevantRuleIds)
            : sql`false`,
          combat
            ? and(
                eq(g.ruleReferences.kind, 'STUNT'),
                eq(g.ruleReferences.status, 'IMPLEMENTED'),
              )
            : sql`false`,
        ),
      )
      .orderBy(g.ruleReferences.id);
    const world = await tx
      .select({
        id: g.worldEntities.id,
        name: g.worldEntities.name,
        status: g.worldEntities.status,
        description: g.worldEntities.description,
        accessible: g.worldEntities.accessible,
      })
      .from(g.worldEntities)
      .where(
        and(
          eq(g.worldEntities.campaignId, campaignId),
          inArray(g.worldEntities.visibility, ['PUBLIC', 'PLAYER_ONLY']),
          adventure?.navigation
            ? eq(g.worldEntities.id, adventure.navigation.locationId)
            : undefined,
        ),
      )
      .limit(20);
    const completed = await this.completedOptions(campaignId, sessionId, tx);
    // A small identity index avoids duplicating personality and critical memories
    // already present in characters/adventure.cast in every planner prompt.
    const actors = [
      ...characters.map((c) => ({
        id: c.id,
        name: c.name,
        kind: c.kind,
        available: vitals.some(
          (v) => v.characterId === c.id && v.living && v.lifeState === 'ALIVE',
        ),
      })),
      ...(adventure?.cast ?? [])
        .filter((c) => c.identity?.identityKind === 'INDIVIDUAL' && c.canSpeak)
        .map((c) => ({
          id: c.id,
          name: c.identity!.name,
          kind: 'STORY_NPC',
          available: true,
        })),
    ];
    const targets = [
      ...actors
        .filter((c) => c.available)
        .map((c) => ({ id: c.id, type: 'CHARACTER', name: c.name })),
      ...world
        .filter((w) => w.accessible)
        .map((w) => ({ id: w.id, type: 'WORLD', name: w.name })),
      ...inventory
        .filter((i) =>
          characters.some(
            (c) => c.kind === 'PROTAGONIST' && c.id === i.characterId,
          ),
        )
        .map((i) => ({ id: i.itemId, type: 'ITEM', name: i.name })),
    ];
    const snapshot = {
      freeActions: true,
      actors,
      adventure,
      ...(adventure?.navigation ? { navigation: adventure.navigation } : {}),
      campaign: campaign
        ? {
            title: campaign.title,
            description: campaign.description,
            plannedSessions: campaign.plannedSessions,
          }
        : null,
      session: session
        ? {
            number: session.sessionNumber,
            title: session.title,
          }
        : null,
      style: plan?.style,
      combat: combat
        ? {
            id: combat.id,
            round: combat.round,
            turnActorId: members[combat.turnIndex]?.characterId ?? null,
            members,
          }
        : null,
      scene: adventure?.publicOpening ?? plan?.opening,
      world,
      characters: characters.map((c) => ({
        id: c.id,
        kind: c.kind,
        name: c.name,
        personality: c.personality,
        motivations: c.motivations,
        state: c.state,
        available: vitals.some(
          (v) => v.characterId === c.id && v.living && v.lifeState === 'ALIVE',
        ),
        abilities: abilities.filter((a) => a.characterId === c.id),
        features: features.filter((f) => f.characterId === c.id),
        resources: resources.filter((r) => r.characterId === c.id),
        conditions: conditions.filter((r) => r.characterId === c.id),
        inventory: inventory.filter((r) => r.characterId === c.id),
        knowledge: knowledge.filter((k) => k.characterId === c.id),
      })),
      memories,
      relationships,
      previous: previous.map((s) => ({
        ...s,
        summary: s.summary?.slice(0, 4000),
      })),
      rules,
      recent: recent
        .reverse()
        .map((m) => ({ ...m, content: m.content.slice(0, 2000) })),
      // No private notes, hidden TN, future plans or effect definitions go to a model.
      options: (plan?.options ?? [])
        .filter(
          (o) =>
            !completed.includes(o.id) &&
            (!o.targetEntityId ||
              targets.some((t) => t.id === o.targetEntityId)) &&
            o.requiresOptionIds.every((id) => completed.includes(id)),
        )
        .map((o) => ({
          id: o.id,
          intent: o.intent,
          mode: o.mode,
          keywords: o.keywords,
          requiresCheck: !!o.check,
          ...(o.targetEntityId
            ? {
                targetEntityId: o.targetEntityId,
                target: targets
                  .filter((t) => t.id === o.targetEntityId)
                  .map((t) => ({ type: t.type, name: t.name }))[0],
              }
            : {}),
        })),
    };
    const dialogue: DialogueMenu[] = [];
    if (plan?.dialogue?.length)
      for (const speaker of snapshot.characters.filter(
        (c) => c.available && c.kind !== 'PROTAGONIST',
      )) {
        const preparedDialogue = await this.dialogueReplies(
          campaignId,
          sessionId,
          speaker,
          tx,
        );
        const choices = preparedDialogue.replies
          .map((r) => ({ topic: r.topic, act: r.act }))
          .filter(
            (r, i, all) =>
              all.findIndex(
                (other) => other.topic === r.topic && other.act === r.act,
              ) === i,
          );
        if (choices.length)
          dialogue.push({
            characterId: speaker.id,
            name: speaker.name,
            choices,
          });
      }
    if (plan?.storyCardDialogue) {
      const story = await storyCardDialogue(
        campaignId,
        sessionId,
        tx,
        this.adventures,
      );
      for (const actor of story.actors) {
        const choices = actor.replies
          .map((r) => ({ topic: r.topic, act: r.act }))
          .filter(
            (r, i, all) =>
              all.findIndex((c) => c.topic === r.topic && c.act === r.act) ===
              i,
          );
        if (choices.length)
          dialogue.push({
            characterId: actor.owner.entityId,
            name: actor.name,
            choices,
          });
      }
    }
    return {
      ...snapshot,
      ...(dialogue.length ? { dialogue } : {}),
      selection: selectionContext(
        snapshot,
        (await this.progress(campaignId, sessionId, tx)).objectives,
      ),
    };
  }
  async rendering(
    campaignId: string,
    sessionId: string,
    messageId: string,
    tx: Reader = this.database.db,
  ): Promise<RenderingContext | null> {
    const [message] = await tx
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.id, messageId));
    const [action] = await tx
      .select()
      .from(n.narrativeActions)
      .where(eq(n.narrativeActions.playerMessageId, messageId));
    if (!message || !action) return null;
    if (message.metadata?.objectResolution === true)
      return {
        category:
          message.interactionMode === 'OUT_OF_CHARACTER' ? 'OOC' : 'OBSERVE',
        protagonist: null,
        speaker: null,
        scene: null,
        facts: [],
        rules: [],
      };
    // Existing exact projections remain compatible; new free turns opt into rendering.
    const free = message.metadata?.freeResolution as
      | {
          category?: string;
          targetId?: string;
          querySubject?: string;
          dialogueSelection?: DialogueSelection;
          dialogueOrigin?: 'STORY_CARD';
        }
      | undefined;
    if (!free?.category) return null;
    const snapshot = await this.build(campaignId, sessionId, tx, messageId);
    const pc = snapshot.characters.find((c) => c.kind === 'PROTAGONIST');
    const character = snapshot.characters.find(
      (c) =>
        free.dialogueOrigin !== 'STORY_CARD' &&
        c.id === free.targetId &&
        c.kind !== 'PROTAGONIST' &&
        c.available,
    );
    const cast = snapshot.adventure?.cast?.find(
      (c) =>
        c.id === free.targetId &&
        c.canSpeak &&
        c.identity?.identityKind === 'INDIVIDUAL',
    );
    const speaker = character
      ? { ...character, speech: '' }
      : cast?.identity
        ? {
            id: cast.id,
            name: cast.identity.name,
            personality: cast.identity.personality,
            motivations: '',
            state: cast.currentState,
            speech: cast.identity.speech,
            // Source-card secrets, history, goals and static knowledge are not public facts.
            knowledge: cast.knowledge.map((k) => ({ ...k, source: 'HEARD' })),
          }
        : null;
    const ooc = free.category === 'OOC';
    const rendering: RenderingContext = {
      category: free.category,
      ...(!character && cast && !ooc
        ? { speakerOrigin: 'STORY_CARD' as const }
        : {}),
      protagonist: pc ? { id: pc.id, name: pc.name } : null,
      speaker:
        !ooc && speaker
          ? {
              id: speaker.id,
              name: speaker.name,
              personality: speaker.personality,
              motivations: speaker.motivations,
              state: speaker.state,
              speech: speaker.speech,
            }
          : null,
      scene: ooc ? null : (snapshot.scene ?? null),
      style: snapshot.style,
      // No global memories, previous summaries, private cards, GM data, other NPC
      // knowledge or recent private/OOC messages cross this boundary.
      facts: ooc ? [] : speaker ? speaker.knowledge : (pc?.knowledge ?? []),
      relationships:
        !ooc && speaker
          ? snapshot.relationships
              .filter((r) => r.fromCharacterId === speaker.id)
              .map((r) => ({
                fromCharacterId: r.fromCharacterId,
                toCharacterId: r.toCharacterId,
                metric: r.metric,
                value: r.value,
              }))
          : [],
      rules: ooc
        ? [
            {
              id: 'basic-check',
              name: 'Teste básico Blue Rose AGE',
              description:
                '3d6 + habilidade + foco aplicável contra dificuldade; terceiro dado é o Drama Die. Foco normal +2, melhorado +3 a partir do nível 11.',
            },
            ...snapshot.rules,
          ]
        : [],
      observations: !ooc && !speaker ? snapshot.world : [],
      inventory: free.querySubject === 'INVENTORY' ? (pc?.inventory ?? []) : [],
      objectives:
        free.querySubject === 'OBJECTIVES'
          ? (await this.progress(campaignId, sessionId, tx)).objectives
          : [],
    };
    if (character && free.category === 'DIALOGUE') {
      const preparedDialogue = await this.dialogueReplies(
        campaignId,
        sessionId,
        character,
        tx,
      );
      if (preparedDialogue.enabled)
        rendering.dialogue = {
          version: 1,
          selection: free.dialogueSelection ?? null,
          replies: free.dialogueSelection
            ? preparedDialogue.replies.filter(
                (r) =>
                  r.topic === free.dialogueSelection!.topic &&
                  r.act === free.dialogueSelection!.act,
              )
            : [],
        };
    }
    if (
      cast &&
      free.category === 'DIALOGUE' &&
      free.dialogueOrigin === 'STORY_CARD'
    ) {
      const story = await storyCardDialogue(
        campaignId,
        sessionId,
        tx,
        this.adventures,
        cast.id,
      );
      if (story.enabled) {
        const actor = story.actors.find((a) => a.owner.entityId === cast.id);
        rendering.facts = actor?.facts ?? [];
        rendering.storyCardSpeaker = actor?.owner;
        rendering.dialogue = {
          version: 1,
          selection: free.dialogueSelection ?? null,
          replies: free.dialogueSelection
            ? (actor?.replies ?? []).filter(
                (r) =>
                  r.topic === free.dialogueSelection!.topic &&
                  r.act === free.dialogueSelection!.act,
              )
            : [],
        };
      }
    }
    if (action.confirmed)
      rendering.publication = {
        version: 1,
        choices: publicationChoices(rendering, action.confirmed),
      };
    return rendering;
  }
  async completedOptions(
    campaignId: string,
    sessionId: string,
    tx: Reader = this.database.db,
  ) {
    const rows = await tx
      .select({ optionId: n.narrativeActions.optionId })
      .from(n.narrativeActions)
      .where(
        and(
          eq(n.narrativeActions.campaignId, campaignId),
          eq(n.narrativeActions.sessionId, sessionId),
          eq(n.narrativeActions.success, true),
          inArray(n.narrativeActions.status, ['COMMITTED', 'COMPLETED']),
        ),
      );
    return rows.flatMap((r) => (r.optionId ? [r.optionId] : []));
  }
  async progress(
    campaignId: string,
    sessionId: string,
    tx: Reader = this.database.db,
  ) {
    const imported = await adventureProgress(campaignId, sessionId, tx);
    if (imported) return imported;
    const [row] = await tx
      .select()
      .from(n.sessionPlans)
      .where(
        and(
          eq(n.sessionPlans.sessionId, sessionId),
          eq(n.sessionPlans.campaignId, campaignId),
        ),
      );
    const done = await this.completedOptions(campaignId, sessionId, tx);
    const objectives = (row?.plan.objectives ?? []).map((o) => ({
      id: o.id,
      description: o.description,
      completed: o.requiredOptionIds.every((id) => done.includes(id)),
      weight: o.weight,
    }));
    const total = objectives.reduce((sum, o) => sum + o.weight, 0);
    const objectiveCompleted =
      objectives.length > 0 && objectives.every((o) => o.completed);
    return {
      objectives,
      progress: total
        ? Math.round(
            (objectives
              .filter((o) => o.completed)
              .reduce((sum, o) => sum + o.weight, 0) *
              100) /
              total,
          )
        : 0,
      objectiveCompleted,
      suggestSessionEnding: objectiveCompleted,
    };
  }
}
