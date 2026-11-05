import { eq, inArray } from 'drizzle-orm';
import type { DatabaseTransaction } from '../database/database.service';
import * as a from '../database/adventure-schema';
import { arcaneContexts, arcaneEffects } from '../database/arcana-schema';
import * as g from '../database/game-schema';
import * as n from '../database/narrative-schema';
import {
  campaigns,
  campaignSessions,
  sessionMessages,
} from '../database/schema';

// Delete leaves before parents under the campaign lock. Catalog tables are shared
// and deliberately excluded. Restrictive FKs make unhandled dependencies fail closed.
export async function deleteExecution(
  campaignId: string,
  tx: DatabaseTransaction,
) {
  const actions = tx
    .select({ id: n.narrativeActions.id })
    .from(n.narrativeActions)
    .where(eq(n.narrativeActions.campaignId, campaignId));
  const cast = tx
    .select({ id: g.characters.id })
    .from(g.characters)
    .where(eq(g.characters.campaignId, campaignId));
  const encounters = tx
    .select({ id: g.combatEncounters.id })
    .from(g.combatEncounters)
    .where(eq(g.combatEncounters.campaignId, campaignId));
  const attacks = tx
    .select({ id: g.combatAttacks.id })
    .from(g.combatAttacks)
    .where(inArray(g.combatAttacks.encounterId, encounters));

  await tx.delete(n.aiUsage).where(inArray(n.aiUsage.actionId, actions));
  await tx
    .delete(g.combatStuntUses)
    .where(inArray(g.combatStuntUses.attackId, attacks));
  await tx
    .delete(g.combatAttacks)
    .where(inArray(g.combatAttacks.encounterId, encounters));

  for (const table of [
    n.narrativeActions,
    n.sessionPlans,
    n.characterKnowledge,
    a.adventureScenes,
    a.adventureReviews,
    a.adventureMemories,
    a.adventureCast,
    a.adventureInstances,
    arcaneContexts,
    arcaneEffects,
    g.combatMembers,
    g.combatEncounters,
    g.campaignMounts,
    g.eventParticipants,
    g.arcanaRequests,
    g.specialCheckRequests,
    g.advancedTests,
    g.diceRolls,
    g.checkRequests,
    g.relationships,
    g.relationshipMetrics,
    g.inventory,
    g.gameItems,
    g.worldEntities,
    g.gameEvents,
    g.gameCommands,
    sessionMessages,
  ]) {
    await tx.delete(table).where(eq(table.campaignId, campaignId));
  }
  for (const table of [
    g.characterSecrets,
    g.characterAbilities,
    g.characterResources,
    g.characterFeatures,
    g.characterDetails,
    g.characterConditions,
    g.characterVitals,
    g.combatProfiles,
    g.weaponTraining,
  ]) {
    await tx.delete(table).where(inArray(table.characterId, cast));
  }

  await tx.delete(g.characters).where(eq(g.characters.campaignId, campaignId));
  await tx
    .delete(campaignSessions)
    .where(eq(campaignSessions.campaignId, campaignId));
  await tx.delete(campaigns).where(eq(campaigns.id, campaignId));
}
