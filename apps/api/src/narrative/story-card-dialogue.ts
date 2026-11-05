import { and, eq } from 'drizzle-orm';
import { campaignSessions } from '../database/schema';
import type { StoryCardSpeaker } from '@solo-rpg/shared-contracts';
import * as a from '../database/adventure-schema';
import * as g from '../database/game-schema';
import * as n from '../database/narrative-schema';
import { loadAdventure, type Reader } from '../adventures/core/state/state';
import { adventureEntityId } from '../adventures/core/state/identity';
import { storyManifestForScope } from '../adventures/core/scenes/story-dialogue';
import type { AdventureRegistry } from '../adventures/core/registry/registry';
import {
  authorizeDialogue,
  type AuthorizedReply,
  type DialogueSource,
} from './dialogue-content';

export function storyHeardSources(
  characterId: string,
  rows: {
    eventId: string;
    description: string;
    eventType: string;
    visibility: string;
  }[],
): DialogueSource[] {
  return rows
    .filter((r) => r.visibility === 'PUBLIC')
    .map((r) => ({
      kind: 'KNOWLEDGE',
      referenceId: r.eventId,
      description: r.description,
      visibility: 'PUBLIC',
      characterId,
      source: 'HEARD',
      eventType: r.eventType,
    }));
}

export async function storyCardDialogue(
  campaignId: string,
  sessionId: string,
  tx: Reader,
  registry: AdventureRegistry,
  targetId?: string,
) {
  const [plan] = await tx
    .select()
    .from(n.sessionPlans)
    .where(eq(n.sessionPlans.sessionId, sessionId));
  const raw = plan?.plan.storyCardDialogue;
  const result: {
    enabled: boolean;
    actors: {
      owner: StoryCardSpeaker;
      name: string;
      replies: AuthorizedReply[];
      facts: { eventId: string; description: string; source: 'HEARD' }[];
    }[];
  } = { enabled: raw !== undefined, actors: [] };
  if (!raw) return result;
  const [session] = await tx
    .select({ status: campaignSessions.status })
    .from(campaignSessions)
    .where(
      and(
        eq(campaignSessions.campaignId, campaignId),
        eq(campaignSessions.id, sessionId),
      ),
    );
  if (session?.status !== 'IN_PROGRESS') return result;
  const loaded = await loadAdventure(campaignId, tx);
  if (!loaded) return result;
  let registered;
  try {
    registered = registry.forDefinition(loaded.definition);
  } catch {
    return result;
  }
  const [reference] = await tx
    .select({ hash: a.adventureDefinitions.digest })
    .from(a.adventureDefinitions)
    .where(eq(a.adventureDefinitions.id, loaded.instance.definitionId));
  const [runtime] = await tx
    .select()
    .from(a.adventureScenes)
    .where(
      and(
        eq(a.adventureScenes.campaignId, campaignId),
        eq(a.adventureScenes.sessionId, sessionId),
      ),
    );
  const manifest = storyManifestForScope(raw, {
    campaignId,
    definitionId: loaded.instance.definitionId,
    definition: loaded.definition,
    registeredDefinition: registered.definition,
    registeredNamespace: registered.entityNamespace,
    storedDigest: reference?.hash ?? '',
    entityNamespace: loaded.instance.entityNamespace,
    sceneKey: runtime?.sceneKey ?? '',
  });
  if (!manifest) return result;
  const scene = loaded.definition.scenes.find(
    (s) => s.key === manifest.sceneKey,
  )!;
  const integrity = await registered.scenePolicy?.read(loaded, tx);
  for (const binding of manifest.bindings) {
    if (integrity) {
      const presence = integrity.presence(scene, binding.characterKey);
      if (!presence.present || !presence.canSpeak) continue;
    }
    if (targetId && binding.entityId !== targetId) continue;
    const [state] = await tx
      .select()
      .from(a.adventureCast)
      .where(
        and(
          eq(a.adventureCast.campaignId, campaignId),
          eq(a.adventureCast.key, binding.characterKey),
        ),
      );
    if (!state?.known || state.currentState !== binding.expectedState) continue;
    // A cast UUID is never an alias for a row with a characters FK.
    const [collision] = await tx
      .select({ id: g.characters.id })
      .from(g.characters)
      .where(eq(g.characters.id, binding.entityId))
      .limit(1);
    if (collision) continue;
    const card = loaded.definition.characters.find(
      (c) => c.key === binding.characterKey,
    )!;
    const owner: StoryCardSpeaker = {
      kind: 'STORY_CARD',
      entityId: binding.entityId,
      characterKey: binding.characterKey,
      definitionId: manifest.definitionId,
      definitionDigest: manifest.definitionDigest,
      entityNamespace: manifest.entityNamespace,
    };
    const knowledge = await tx
      .select({
        eventId: g.gameEvents.id,
        description: g.gameEvents.description,
        eventType: g.gameEvents.type,
        visibility: g.gameEvents.visibility,
      })
      .from(a.adventureMemories)
      .innerJoin(g.gameEvents, eq(a.adventureMemories.eventId, g.gameEvents.id))
      .where(
        and(
          eq(a.adventureMemories.campaignId, campaignId),
          eq(a.adventureMemories.characterKey, binding.characterKey),
          eq(g.gameEvents.campaignId, campaignId),
          eq(g.gameEvents.visibility, 'PUBLIC'),
        ),
      );
    const sources = storyHeardSources(binding.entityId, knowledge);
    const locationId = adventureEntityId(
      campaignId,
      scene.locationKey,
      loaded.instance.entityNamespace,
    );
    if (
      binding.sources.some(
        (s) => s.kind === 'PUBLIC' && s.referenceId === locationId,
      )
    ) {
      const [location] = await tx
        .select()
        .from(g.worldEntities)
        .where(
          and(
            eq(g.worldEntities.id, locationId),
            eq(g.worldEntities.campaignId, campaignId),
            eq(g.worldEntities.visibility, 'PUBLIC'),
            eq(g.worldEntities.accessible, true),
          ),
        );
      if (location)
        sources.push({
          kind: 'PUBLIC',
          referenceId: location.id,
          description: location.description,
          visibility: 'PUBLIC',
          accessible: true,
        });
    }
    const replies = authorizeDialogue(
      {
        libraryId: binding.libraryId,
        contentVersion: binding.contentVersion,
        characterId: binding.entityId,
        voiceId: binding.voiceId,
        expectedState: binding.expectedState,
        topics: [...new Set(binding.choices.map((c) => c.topic))],
        sources: binding.sources,
        provenance: binding.provenance,
      },
      {
        id: binding.entityId,
        name: card.name,
        state: state.currentState,
        available: true,
      },
      sources,
    )
      .filter((r) =>
        binding.choices.some((c) => c.topic === r.topic && c.act === r.act),
      )
      .map((r) => ({ ...r, owner, manifestProvenance: manifest.provenance }));
    result.actors.push({
      owner,
      name: card.name,
      replies,
      facts: knowledge.map((k) => ({
        eventId: k.eventId,
        description: k.description,
        source: 'HEARD',
      })),
    });
  }
  return result;
}
