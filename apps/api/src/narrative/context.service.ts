import { activeSeconds } from '../sessions/session-state';
import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, max, sql } from 'drizzle-orm';
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

type Reader = DatabaseService['db'] | DatabaseTransaction;
@Injectable()
export class NarrativeContextService {
  constructor(private readonly database: DatabaseService) {}
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
    const present = plan?.presentCharacterIds ?? [];
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
            quantity: g.inventory.quantity,
          })
          .from(g.inventory)
          .innerJoin(g.gameItems, eq(g.inventory.itemId, g.gameItems.id))
          .where(
            and(
              inArray(g.inventory.characterId, ids),
              inArray(g.gameItems.visibility, ['PUBLIC', 'PLAYER_ONLY']),
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
    const knowledge = present.length
      ? await tx
          .select({
            characterId: n.characterKnowledge.characterId,
            eventId: g.gameEvents.id,
            description: g.gameEvents.description,
            importance: n.characterKnowledge.importance,
          })
          .from(n.characterKnowledge)
          .innerJoin(
            g.gameEvents,
            eq(n.characterKnowledge.eventId, g.gameEvents.id),
          )
          .where(
            and(
              eq(n.characterKnowledge.campaignId, campaignId),
              inArray(n.characterKnowledge.characterId, present),
              inArray(g.gameEvents.visibility, ['PUBLIC', 'PLAYER_ONLY']),
            ),
          )
          .orderBy(
            desc(n.characterKnowledge.importance),
            desc(g.gameEvents.sequence),
          )
          .limit(60)
      : [];
    const relationships = await tx
      .select()
      .from(g.relationships)
      .where(
        and(
          eq(g.relationships.campaignId, campaignId),
          inArray(g.relationships.visibility, ['PUBLIC', 'PLAYER_ONLY']),
        ),
      )
      .limit(50);
    const recent = await tx
      .select({
        role: sessionMessages.role,
        mode: sessionMessages.interactionMode,
        content: sessionMessages.content,
      })
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, sessionId))
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
    const rules = await tx
      .select()
      .from(g.ruleReferences)
      .where(eq(g.ruleReferences.status, 'IMPLEMENTED'))
      .limit(15);
    const world = await tx
      .select({
        id: g.worldEntities.id,
        name: g.worldEntities.name,
        status: g.worldEntities.status,
        description: g.worldEntities.description,
      })
      .from(g.worldEntities)
      .where(
        and(
          eq(g.worldEntities.campaignId, campaignId),
          inArray(g.worldEntities.visibility, ['PUBLIC', 'PLAYER_ONLY']),
        ),
      )
      .limit(20);
    const completed = await this.completedOptions(campaignId, sessionId, tx);
    return {
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
            activeSeconds: activeSeconds(session, new Date()),
            targetMinutes: session.estimatedDurationMinutes,
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
      scene: plan?.opening,
      world,
      characters: characters.map((c) => ({
        id: c.id,
        kind: c.kind,
        name: c.name,
        personality: c.personality,
        motivations: c.motivations,
        state: c.state,
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
            o.requiresOptionIds.every((id) => completed.includes(id)),
        )
        .map((o) => ({
          id: o.id,
          intent: o.intent,
          mode: o.mode,
          keywords: o.keywords,
          requiresCheck: !!o.check,
        })),
    };
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
