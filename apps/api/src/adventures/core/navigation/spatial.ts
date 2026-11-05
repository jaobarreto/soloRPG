import { campaignMounts } from '../../../database/game-schema';
import { ne } from 'drizzle-orm';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { gameEvents, worldEntities } from '../../../database/game-schema';
import { adventureScenes } from '../../../database/adventure-schema';
import { sessionPlans } from '../../../database/narrative-schema';
import type { DatabaseTransaction } from '../../../database/database.service';
import type { LoadedAdventure, Reader } from '../state/state';
import { adventureEntityId } from '../state/identity';

const eventType = 'ADVENTURE_SPATIAL_STATE';

export async function spatialState(
  loaded: LoadedAdventure,
  tx: Reader,
  aliases: Readonly<Record<string, string>> = {},
) {
  const graph = loaded.definition.spatial;
  if (!graph) return null;
  const { campaignId, entityNamespace } = loaded.instance;
  const entityId = (key: string) =>
    adventureEntityId(campaignId, key, entityNamespace);
  const events = await tx
    .select({ changes: gameEvents.changes })
    .from(gameEvents)
    .where(
      and(
        eq(gameEvents.campaignId, campaignId),
        eq(gameEvents.type, eventType),
        eq(gameEvents.visibility, 'GM_ONLY'),
      ),
    )
    .orderBy(asc(gameEvents.sequence));
  const visits = new Map<string, number>();
  const gates = new Map<string, boolean>();
  let current: string | undefined;
  let previous: string | undefined;
  for (const { changes } of events) {
    if (
      typeof changes.arrival === 'string' &&
      graph.places.some((p) => p.key === changes.arrival)
    ) {
      previous = current;
      current = changes.arrival;
      visits.set(current, (visits.get(current) ?? 0) + 1);
    }
    if (
      typeof changes.passage === 'string' &&
      typeof changes.open === 'boolean'
    )
      gates.set(changes.passage, changes.open);
  }
  const entities = await tx
    .select()
    .from(worldEntities)
    .where(
      and(
        eq(worldEntities.campaignId, campaignId),
        inArray(
          worldEntities.id,
          graph.places.map((p) => entityId(p.key)),
        ),
      ),
    );
  const byKey = new Map(
    graph.places.map((p) => [
      p.key,
      entities.find((e) => e.id === entityId(p.key)),
    ]),
  );
  const closed = (key: string | null) => {
    while (key) {
      const entity = byKey.get(key);
      if (
        !entity ||
        (!entity.accessible &&
          (entity.visibility !== 'GM_ONLY' || entity.status !== 'INITIAL')) ||
        ['BURNED', 'FLOODED', 'DESTROYED'].includes(entity.status)
      )
        return true;
      key = graph.places.find((p) => p.key === key)?.parent ?? null;
    }
    return false;
  };
  const exits = graph.passages
    .filter((e) => e.from === current || e.to === current)
    .map((edge) => {
      const reverse = edge.to === current;
      const to = reverse ? edge.from : edge.to;
      const entity = to ? byKey.get(to) : undefined;
      const condition = reverse && edge.uphillOnly ? 'OPEN' : edge.condition;
      const blocked =
        condition === 'BLOCKED' ||
        (!reverse || !edge.uphillOnly
          ? gates.get(edge.key) === false
          : false) ||
        !entity ||
        closed(to);
      const status = blocked
        ? 'BLOCKED'
        : condition === 'LOCAL' && !gates.get(edge.key)
          ? 'LOCAL'
          : 'OPEN';
      const label = reverse
        ? `Voltar pela passagem para ${aliases[edge.from] ?? edge.from}`
        : edge.label;
      return {
        edge,
        reverse,
        to,
        label,
        status,
        destinationKnown: !!entity && entity.visibility !== 'GM_ONLY',
        id: entityId(`passage-${current}-${edge.key}`),
      };
    });
  return { current, previous, visits, byKey, exits };
}

export async function recordSpatialChange(
  loaded: LoadedAdventure,
  sessionId: string,
  commandId: string,
  changes: Record<string, unknown>,
  reason: string,
  tx: DatabaseTransaction,
) {
  await tx.insert(gameEvents).values({
    campaignId: loaded.instance.campaignId,
    sessionId,
    commandId,
    type: eventType,
    changes,
    description: reason,
    visibility: 'GM_ONLY',
  });
}

export async function spatialArrival(
  loaded: LoadedAdventure,
  sessionId: string,
  key: string,
  tx: DatabaseTransaction,
  commandId?: string,
) {
  const state = await spatialState(loaded, tx);
  if (!state || state.current === key) return;
  await recordSpatialChange(
    loaded,
    sessionId,
    commandId ??
      adventureEntityId(
        loaded.instance.campaignId,
        `arrival-${sessionId}-${key}`,
        loaded.instance.entityNamespace,
      ),
    { arrival: key },
    'Chegada confirmada ao local.',
    tx,
  );
  const entity = state.byKey.get(key);
  if (entity)
    await tx
      .update(campaignMounts)
      .set({ mounted: false })
      .where(
        and(
          eq(campaignMounts.campaignId, loaded.instance.campaignId),
          ne(campaignMounts.locationId, entity.id),
        ),
      );

  if (entity?.visibility === 'GM_ONLY')
    await tx
      .update(worldEntities)
      .set({
        visibility: 'PUBLIC',
        accessible: entity.status === 'INITIAL' || entity.accessible,
      })
      .where(
        and(
          eq(worldEntities.campaignId, loaded.instance.campaignId),
          eq(worldEntities.id, entity.id),
        ),
      );
}

export async function detachSpatialEncounter(
  loaded: LoadedAdventure,
  sessionId: string,
  opening: string,
  tx: DatabaseTransaction,
) {
  await tx
    .delete(adventureScenes)
    .where(
      and(
        eq(adventureScenes.campaignId, loaded.instance.campaignId),
        eq(adventureScenes.sessionId, sessionId),
      ),
    );
  const [plan] = await tx
    .select()
    .from(sessionPlans)
    .where(eq(sessionPlans.sessionId, sessionId));
  if (plan) {
    const remaining = { ...plan.plan };
    delete remaining.storyCardDialogue;
    await tx
      .update(sessionPlans)
      .set({
        plan: {
          ...remaining,
          opening: opening,
          options: [],
          objectives: [],
        },
      })
      .where(eq(sessionPlans.sessionId, sessionId));
  }
}

export async function setPassage(
  loaded: LoadedAdventure,
  sessionId: string,
  commandId: string,
  passage: string,
  open: boolean,
  reason: string,
  tx: DatabaseTransaction,
) {
  const state = await spatialState(loaded, tx);
  const exit = state?.exits.find((e) => e.edge.key === passage);
  if (!exit?.to || exit.edge.condition === 'BLOCKED') return false;
  await recordSpatialChange(
    loaded,
    sessionId,
    commandId,
    { passage, open },
    reason,
    tx,
  );
  return true;
}
