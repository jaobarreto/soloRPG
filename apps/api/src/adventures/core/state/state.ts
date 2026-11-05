import {
  adventurePlanningSchema,
  planningReceiptId,
} from '../director/planning';
import { adventureEntityId } from './identity';
export { adventureEntityId, digest } from './identity';
import { directorState } from '../director/director';
import { and, eq, inArray } from 'drizzle-orm';
import type {
  DatabaseService,
  DatabaseTransaction,
} from '../../../database/database.service';
import * as a from '../../../database/adventure-schema';
import * as g from '../../../database/game-schema';
import { stepId } from '../../../narrative/identifiers';
import { narrativeActions } from '../../../database/narrative-schema';
import { campaignSessions } from '../../../database/schema';
export type Reader = DatabaseService['db'] | DatabaseTransaction;

export async function loadAdventure(campaignId: string, tx: Reader) {
  const [row] = await tx
    .select({
      instance: a.adventureInstances,
      definition: a.adventureDefinitions.definition,
      planning: g.gameCommands.result,
    })
    .from(a.adventureInstances)
    .innerJoin(
      a.adventureDefinitions,
      eq(a.adventureDefinitions.id, a.adventureInstances.definitionId),
    )
    .leftJoin(
      g.gameCommands,
      and(
        eq(g.gameCommands.campaignId, a.adventureInstances.campaignId),
        eq(g.gameCommands.commandId, planningReceiptId(campaignId)),
      ),
    )
    .where(eq(a.adventureInstances.campaignId, campaignId));
  if (!row) return undefined;
  const { planning, ...loaded } = row;
  if (!planning) return { ...loaded, planning: undefined };
  const plan = adventurePlanningSchema.parse(planning);
  if (plan.definitionId !== loaded.instance.definitionId)
    throw new Error(
      'Editorial planning does not match the imported definition',
    );
  return { ...loaded, planning: plan };
}
export type LoadedAdventure = NonNullable<
  Awaited<ReturnType<typeof loadAdventure>>
>;

// A review hashes the full mechanical snapshot; edits after review invalidate readiness.
export async function sheetSnapshot(campaignId: string, tx: Reader) {
  const cast = await tx
    .select()
    .from(g.characters)
    .where(
      and(
        eq(g.characters.campaignId, campaignId),
        inArray(g.characters.kind, ['PROTAGONIST', 'COMPANION']),
      ),
    )
    .orderBy(g.characters.id);
  const ids = cast.map((c) => c.id);
  if (!ids.length)
    return {
      cast,
      abilities: [],
      features: [],
      resources: [],
      vitals: [],
      inventory: [],
      profiles: [],
      training: [],
      conditions: [],
      details: [],
    };
  return {
    cast,
    details: await tx
      .select()
      .from(g.characterDetails)
      .where(inArray(g.characterDetails.characterId, ids))
      .orderBy(
        g.characterDetails.characterId,
        g.characterDetails.kind,
        g.characterDetails.value,
      ),
    abilities: await tx
      .select()
      .from(g.characterAbilities)
      .where(inArray(g.characterAbilities.characterId, ids))
      .orderBy(g.characterAbilities.characterId, g.characterAbilities.ability),
    features: await tx
      .select()
      .from(g.characterFeatures)
      .where(inArray(g.characterFeatures.characterId, ids))
      .orderBy(g.characterFeatures.characterId, g.characterFeatures.ruleId),
    resources: await tx
      .select()
      .from(g.characterResources)
      .where(inArray(g.characterResources.characterId, ids))
      .orderBy(g.characterResources.characterId, g.characterResources.name),
    vitals: await tx
      .select()
      .from(g.characterVitals)
      .where(inArray(g.characterVitals.characterId, ids))
      .orderBy(g.characterVitals.characterId),
    inventory: await tx
      .select({ entry: g.inventory, item: g.gameItems })
      .from(g.inventory)
      .innerJoin(g.gameItems, eq(g.gameItems.id, g.inventory.itemId))
      .where(inArray(g.inventory.characterId, ids))
      .orderBy(g.inventory.characterId, g.inventory.itemId),
    profiles: await tx
      .select()
      .from(g.combatProfiles)
      .where(inArray(g.combatProfiles.characterId, ids))
      .orderBy(g.combatProfiles.characterId),
    training: await tx
      .select()
      .from(g.weaponTraining)
      .where(inArray(g.weaponTraining.characterId, ids))
      .orderBy(g.weaponTraining.characterId, g.weaponTraining.ruleId),
    conditions: await tx
      .select()
      .from(g.characterConditions)
      .where(inArray(g.characterConditions.characterId, ids))
      .orderBy(g.characterConditions.id),
  };
}
export async function adventureProgress(
  campaignId: string,
  sessionId: string,
  tx: Reader,
) {
  const loaded = await loadAdventure(campaignId, tx);
  if (!loaded) return null;
  if (loaded.definition.progression)
    return (await directorState(loaded, sessionId, tx))?.public ?? null;
  const [session] = await tx
    .select()
    .from(campaignSessions)
    .where(
      and(
        eq(campaignSessions.campaignId, campaignId),
        eq(campaignSessions.id, sessionId),
      ),
    );
  const plan = loaded.definition.sessions.find(
    (s) => s.number === session?.sessionNumber,
  );
  const [review] = await tx
    .select()
    .from(a.adventureReviews)
    .where(
      and(
        eq(a.adventureReviews.campaignId, campaignId),
        eq(a.adventureReviews.sessionId, sessionId),
      ),
    );
  const evidence = review?.eventIds.length
    ? await tx
        .select({ id: g.gameEvents.id, visibility: g.gameEvents.visibility })
        .from(g.gameEvents)
        .where(
          and(
            eq(g.gameEvents.campaignId, campaignId),
            eq(g.gameEvents.sessionId, sessionId),
            inArray(g.gameEvents.id, review.eventIds),
          ),
        )
    : [];
  const required = plan?.completionEvidence;
  const receipts = required
    ? await tx
        .select()
        .from(narrativeActions)
        .where(
          and(
            eq(narrativeActions.campaignId, campaignId),
            eq(narrativeActions.sessionId, sessionId),
            eq(narrativeActions.success, true),
            inArray(narrativeActions.status, ['COMMITTED', 'COMPLETED']),
          ),
        )
    : [];
  const confirmed = required
    ? await tx
        .select({ id: g.gameEvents.id, commandId: g.gameEvents.commandId })
        .from(g.gameEvents)
        .where(
          and(
            eq(g.gameEvents.campaignId, campaignId),
            eq(g.gameEvents.sessionId, sessionId),
            inArray(g.gameEvents.visibility, ['PUBLIC', 'PLAYER_ONLY']),
            eq(g.gameEvents.type, 'CONSEQUENCE_RECORDED'),
          ),
        )
    : [];
  const receiptEvidence = (receipt: (typeof receipts)[number]) =>
    confirmed.filter(
      (event) =>
        receipt.confirmed?.eventIds.includes(event.id) &&
        event.commandId === stepId(receipt.id, 'scene-result'),
    );
  const evidenced = (entry: { sceneKey: string; optionKey: string }) =>
    receipts.find(
      (receipt) =>
        receipt.optionId ===
          adventureEntityId(
            campaignId,
            `option-${entry.sceneKey}-${entry.optionKey}`,
            loaded.instance.entityNamespace,
          ) && receiptEvidence(receipt).length > 0,
    );
  const automatic =
    !!required?.length && required.every((entry) => !!evidenced(entry));
  const completed =
    automatic ||
    (!!review &&
      evidence.length === review.eventIds.length &&
      evidence.length > 0);
  const evidenceEventIds = automatic
    ? [
        ...new Set(
          required!.flatMap((entry) =>
            receiptEvidence(evidenced(entry)!).map((event) => event.id),
          ),
        ),
      ]
    : completed
      ? evidence
          .filter((event) => event.visibility !== 'GM_ONLY')
          .map((event) => event.id)
      : [];
  return {
    objectives: [
      {
        id: adventureEntityId(
          campaignId,
          `objective-${session?.sessionNumber}`,
          loaded.instance.entityNamespace,
        ),
        description:
          session?.status === 'LOCKED'
            ? 'Objetivo ainda não revelado.'
            : (plan?.mainObjective ?? 'Revisão do capítulo'),
        completed,
        evidenceEventIds,
        weight: 1,
      },
    ],
    progress: completed ? 100 : 0,
    objectiveCompleted: completed,
    suggestSessionEnding: completed,
  };
}
