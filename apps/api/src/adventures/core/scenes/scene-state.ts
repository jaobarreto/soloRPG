import { spatialArrival, spatialState } from '../navigation/spatial';
import { adventureEntityId } from '../state/identity';
import { directorState } from '../director/director';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { DatabaseTransaction } from '../../../database/database.service';
import * as a from '../../../database/adventure-schema';
import * as g from '../../../database/game-schema';
import { campaignSessions } from '../../../database/schema';
import type { AdventureRegistry } from '../registry/registry';
import { loadAdventure, type Reader } from '../state/state';

export async function activateAdventureScene(
  campaignId: string,
  sessionId: string,
  tx: DatabaseTransaction,
  registry: AdventureRegistry,
) {
  const loaded = await loadAdventure(campaignId, tx);
  if (!loaded) return;
  const module = registry.forDefinition(loaded.definition);
  const [runtime] = await tx
    .select()
    .from(a.adventureScenes)
    .where(
      and(
        eq(a.adventureScenes.campaignId, campaignId),
        eq(a.adventureScenes.sessionId, sessionId),
      ),
    );
  const scene = loaded.definition.scenes.find(
    (s) => s.key === runtime?.sceneKey,
  );
  if (!scene) return;
  await spatialArrival(loaded, sessionId, scene.locationKey, tx);
  const integrity = await module.scenePolicy?.read(loaded, tx);
  await integrity?.activate?.(scene, sessionId, tx);
  for (const key of scene.characterKeys) {
    if (
      integrity &&
      (!integrity.presence(scene, key).present ||
        !integrity.identifies(scene, key))
    )
      continue;
    await tx
      .update(a.adventureCast)
      .set({ known: true })
      .where(
        and(
          eq(a.adventureCast.campaignId, campaignId),
          eq(a.adventureCast.key, key),
        ),
      );
  }
  await tx
    .update(g.worldEntities)
    .set({ visibility: 'PUBLIC', accessible: true })
    .where(
      and(
        eq(g.worldEntities.campaignId, campaignId),
        integrity ? eq(g.worldEntities.visibility, 'GM_ONLY') : undefined,
        eq(
          g.worldEntities.id,
          adventureEntityId(
            campaignId,
            scene.locationKey,
            loaded.instance.entityNamespace,
          ),
        ),
      ),
    );
}
export async function adventureContext(
  campaignId: string,
  sessionId: string,
  tx: Reader,
  registry: AdventureRegistry,
  plannedParty: string[] = [],
) {
  const loaded = await loadAdventure(campaignId, tx);
  if (!loaded) return { context: null, presentParty: plannedParty };
  const module = registry.forDefinition(loaded.definition);
  const [runtime] = await tx
    .select()
    .from(a.adventureScenes)
    .where(
      and(
        eq(a.adventureScenes.sessionId, sessionId),
        eq(a.adventureScenes.campaignId, campaignId),
      ),
    );
  const spatial = await spatialState(loaded, tx, module.navigation?.aliases);
  const current = loaded.definition.locations.find(
    (l) => l.key === spatial?.current,
  );
  const isPresent = module.navigation?.partyMemberPresent;
  const presentParty =
    current && isPresent
      ? plannedParty.filter((id) =>
          isPresent(loaded.instance.mechanics, id, current.key),
        )
      : plannedParty;
  const prepared = loaded.definition.scenes.find(
    (s) =>
      s.key === runtime?.sceneKey &&
      (!current || s.locationKey === current.key),
  );
  const scene =
    prepared ??
    (current
      ? {
          key: '',
          locationKey: current.key,
          encounterKey: '',
          opening: current.description,
          characterKeys: [],
          gmSecrets: [],
          endingKeys: [],
          options: [],
        }
      : undefined);
  const navigation =
    current && spatial
      ? {
          locationId: spatial.byKey.get(current.key)!.id,
          name: current.name,
          visits: spatial.visits.get(current.key)!,
          exits: spatial.exits.map(
            ({ id, label, status, edge, destinationKnown }, index) => ({
              id,
              label:
                destinationKnown || edge.condition !== 'OPEN'
                  ? label
                  : `Passagem ${index + 1}`,
              status,
              destinationKnown,
              kind: edge.kind,
            }),
          ),
        }
      : undefined;
  if (!scene)
    return {
      presentParty,
      context: {
        title: loaded.definition.title,
        requiresLocalPreparation: true,
        integrityEnabled: !!module.scenePolicy,
        publicOpening: undefined,
        navigation: undefined,
        cast: undefined,
        gm: undefined,
      },
    };
  const [session] = await tx
    .select()
    .from(campaignSessions)
    .where(
      and(
        eq(campaignSessions.campaignId, campaignId),
        eq(campaignSessions.id, sessionId),
      ),
    );
  const sessionPlan = loaded.definition.sessions.find(
    (s) => s.number === session?.sessionNumber,
  );
  const location = loaded.definition.locations.find(
    (l) => l.key === scene.locationKey,
  );
  const integrity = await module.scenePolicy?.read(loaded, tx);
  const keys = integrity
    ? loaded.definition.characters
        .filter((c) => integrity.presence(scene, c.key).present)
        .map((c) => c.key)
    : scene.characterKeys;
  const cast = keys.length
    ? await tx
        .select()
        .from(a.adventureCast)
        .where(
          and(
            eq(a.adventureCast.campaignId, campaignId),
            eq(a.adventureCast.known, true),
            inArray(a.adventureCast.key, keys),
          ),
        )
    : [];
  const memories = cast.length
    ? await tx
        .select({
          characterKey: a.adventureMemories.characterKey,
          eventId: g.gameEvents.id,
          description: g.gameEvents.description,
        })
        .from(a.adventureMemories)
        .innerJoin(
          g.gameEvents,
          eq(g.gameEvents.id, a.adventureMemories.eventId),
        )
        .where(
          and(
            eq(a.adventureMemories.campaignId, campaignId),
            inArray(
              a.adventureMemories.characterKey,
              cast.map((c) => c.key),
            ),
            inArray(g.gameEvents.visibility, ['PUBLIC', 'PLAYER_ONLY']),
          ),
        )
        // These associations are already scoped to the scene's named cast.
        // No salience field exists here: a global cap could erase one NPC's
        // only conflict while retaining another NPC's recent conversation.
        .orderBy(desc(g.gameEvents.sequence))
    : [];
  const director = await directorState(loaded, sessionId, tx);
  // Planner-only GM information. NARRATE receives only the public receipt, never this object.
  return {
    presentParty,
    context: {
      title: loaded.definition.title,
      integrityEnabled: !!integrity,
      narrativeMinutes: loaded.instance.narrativeMinutes,
      sourcePages: loaded.definition.encounters.find(
        (e) => e.key === scene.encounterKey,
      )?.sourcePages,
      location: scene.locationKey,
      navigation,
      ...(integrity && location
        ? {
            publicOpening:
              integrity.describe(location) === location.description
                ? scene.opening
                : integrity.describe(location),
          }
        : {}),
      gm: {
        director: director
          ? {
              objectives: director.objectives.map((objective) => ({
                key: objective.key,
                description: objective.description,
                status: objective.status,
              })),
              closureAuthorized: director.eligible,
            }
          : null,
        // Contains player-approved fear memories and the private clock; never serialize publicly.
        runtimeMechanics: loaded.instance.mechanics,
        encounter: loaded.definition.encounters.find(
          (e) => e.key === scene.encounterKey,
        ),
        ...(loaded.planning
          ? {
              sessionPlan: {
                title:
                  loaded.planning.sessions[(session?.sessionNumber ?? 0) - 1]
                    ?.title,
              },
            }
          : {
              synopsis: loaded.definition.synopsis,
              centralConflict: loaded.definition.centralConflict,
              sessionPlan,
            }),
        location,
        possibleEndings: loaded.definition.endings.filter((ending) =>
          (
            scene.endingKeys ??
            module.sceneEndingKeys?.[scene.key] ??
            []
          ).includes(ending.key),
        ),
        secrets: scene.gmSecrets,
        mechanics: loaded.definition.encounters.find(
          (e) => e.key === scene.encounterKey,
        )?.mechanics,
        localAdjudicationRequired: !!loaded.definition.encounters.find(
          (e) => e.key === scene.encounterKey,
        )?.blockers.length,
      },
      cast: cast.map((state) => ({
        id: adventureEntityId(
          campaignId,
          state.key,
          loaded.instance.entityNamespace,
        ),
        identity: loaded.definition.characters.find((c) => c.key === state.key),
        currentState: state.currentState,
        canSpeak: integrity
          ? integrity.presence(scene, state.key).canSpeak
          : true,
        knowledge: memories.filter((m) => m.characterKey === state.key),
      })),
    },
  };
}
export async function rememberAdventureEvent(
  campaignId: string,
  sessionId: string,
  eventId: string,
  tx: DatabaseTransaction,
  registry: AdventureRegistry,
) {
  const loaded = await loadAdventure(campaignId, tx);
  if (!loaded) return;
  const module = registry.forDefinition(loaded.definition);
  const [runtime] = await tx
    .select()
    .from(a.adventureScenes)
    .where(eq(a.adventureScenes.sessionId, sessionId));
  const spatial = await spatialState(loaded, tx, module.navigation?.aliases);
  const scene =
    loaded.definition.scenes.find(
      (s) =>
        s.key === runtime?.sceneKey &&
        (!spatial?.current || s.locationKey === spatial.current),
    ) ??
    (spatial?.current
      ? { key: '', locationKey: spatial.current, characterKeys: [] }
      : undefined);
  if (!scene) return;
  const integrity = await module.scenePolicy?.read(loaded, tx);
  const keys = integrity
    ? loaded.definition.characters
        .filter((c) => integrity.presence(scene, c.key).present)
        .map((c) => c.key)
    : scene.characterKeys;
  if (!keys.length) return;
  const known = await tx
    .select()
    .from(a.adventureCast)
    .where(
      and(
        eq(a.adventureCast.campaignId, campaignId),
        eq(a.adventureCast.known, true),
        inArray(a.adventureCast.key, keys),
      ),
    );
  for (const c of known.filter((state) =>
    loaded.definition.characters.some(
      (card) => card.key === state.key && card.identityKind === 'INDIVIDUAL',
    ),
  ))
    await tx
      .insert(a.adventureMemories)
      .values({ campaignId, characterKey: c.key, eventId })
      .onConflictDoNothing();
}
