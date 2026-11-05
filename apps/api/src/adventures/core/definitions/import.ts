import { ConflictException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DatabaseTransaction } from '../../../database/database.service';
import * as a from '../../../database/adventure-schema';
import * as g from '../../../database/game-schema';
import {
  campaigns,
  campaignSessions,
  sessionMessages,
} from '../../../database/schema';
import { sessionPlans } from '../../../database/narrative-schema';
import {
  adventureDefinitionSchema,
  type AdventureDefinition,
} from './definition';
import { adventureEntityId, digest, loadAdventure } from '../state/state';
export async function importAdventure(
  campaignId: string,
  status: string,
  source: AdventureDefinition,
  entityNamespace: string,
  tx: DatabaseTransaction,
) {
  const definition = adventureDefinitionSchema.parse(source),
    definitionId = `${definition.id}:v${definition.version}`,
    hash = digest(definition);
  await tx
    .insert(a.adventureDefinitions)
    .values({ id: definitionId, digest: hash, definition })
    .onConflictDoNothing();
  const [stored] = await tx
    .select()
    .from(a.adventureDefinitions)
    .where(eq(a.adventureDefinitions.id, definitionId));
  if (stored?.digest !== hash)
    throw new ConflictException(
      'Reference changed: create a reviewed version instead of overwriting it',
    );
  const loaded = await loadAdventure(campaignId, tx);
  if (loaded) {
    if (loaded.instance.definitionId !== definitionId)
      throw new ConflictException('Different adventure already imported');
    return { id: campaignId, imported: false };
  }
  if (status !== 'DRAFT')
    throw new ConflictException('Cannot import over a started campaign');
  const sessions = await tx
    .select()
    .from(campaignSessions)
    .where(eq(campaignSessions.campaignId, campaignId));
  if (
    sessions.some(
      (s) => s.startedAt || !['AVAILABLE', 'LOCKED'].includes(s.status),
    ) ||
    (sessions.length && sessions.length !== definition.sessions.length)
  )
    throw new ConflictException(
      'Use a fresh draft with matching empty planned sessions',
    );
  const [history] = await tx
    .select({ id: sessionMessages.id })
    .from(sessionMessages)
    .where(eq(sessionMessages.campaignId, campaignId))
    .limit(1);
  const [plan] = await tx
    .select()
    .from(sessionPlans)
    .where(eq(sessionPlans.campaignId, campaignId))
    .limit(1);
  if (history || plan)
    throw new ConflictException(
      'Import preserves existing chats and prepared plans; use another draft',
    );
  await tx
    .update(campaigns)
    .set({ plannedSessions: definition.sessions.length })
    .where(eq(campaigns.id, campaignId));
  await tx
    .insert(a.adventureInstances)
    .values({ campaignId, definitionId, entityNamespace });
  await tx
    .insert(a.adventureCast)
    .values(definition.characters.map((c) => ({ campaignId, key: c.key })));
  await tx.insert(g.worldEntities).values(
    definition.locations.map((l) => ({
      id: adventureEntityId(campaignId, l.key, entityNamespace),
      campaignId,
      kind: 'LOCATION' as const,
      name: l.name,
      description: l.description,
      status: 'INITIAL',
      accessible: false,
      visibility: 'GM_ONLY' as const,
      privateNotes: `${definition.sourceBook} pp.${l.sourcePages.join(',')}; ${l.secrets.join(' ')}`,
    })),
  );
  if (!sessions.length)
    await tx.insert(campaignSessions).values(
      definition.sessions.map((s) => ({
        id: adventureEntityId(
          campaignId,
          `session-${s.number}`,
          entityNamespace,
        ),
        campaignId,
        sessionNumber: s.number,
        title: `Sessão ${s.number}`,
        status: s.number === 1 ? ('AVAILABLE' as const) : ('LOCKED' as const),
        estimatedDurationMinutes: s.targetMinutes,
      })),
    );
  return {
    id: campaignId,
    imported: true,
    storyCards: definition.characters.length,
    locations: definition.locations.length,
    encounters: definition.encounters.length,
    sessions: definition.sessions.length,
    readyToPlay: false,
  };
}
