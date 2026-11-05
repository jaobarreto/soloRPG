import { travelPending } from './queued-interaction';
import { guidedParty } from '../adventures/core/state/guided-party';
import type { AdventureRegistry } from '../adventures/core/registry/registry';
import { spatialState } from '../adventures/core/navigation/spatial';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { and, eq, gt, inArray } from 'drizzle-orm';
import { z } from 'zod';
import {
  mentionSchema,
  validMentionSpans,
  type MentionCandidate,
  type ResolvedMention,
} from '@solo-rpg/shared-contracts';
import { campaignSessions } from '../database/schema';
import { sessionPlans } from '../database/narrative-schema';
import * as g from '../database/game-schema';
import { adventureCast, adventureScenes } from '../database/adventure-schema';
import {
  adventureEntityId,
  loadAdventure,
  type Reader,
} from '../adventures/core/state/state';
import { normalizeName } from './free-action';

export function storedMentions(
  metadata: Record<string, unknown> | null,
): ResolvedMention[] {
  return z
    .array(mentionSchema)
    .max(30)
    .parse(metadata?.mentions ?? []);
}
export async function authorizedMentions(
  campaignId: string,
  sessionId: string,
  tx: Reader,
  registry: AdventureRegistry,
): Promise<MentionCandidate[]> {
  const [session] = await tx
    .select()
    .from(campaignSessions)
    .where(
      and(
        eq(campaignSessions.id, sessionId),
        eq(campaignSessions.campaignId, campaignId),
      ),
    );
  if (!session) throw new NotFoundException('Session not found in campaign');
  if (session.status === 'LOCKED') return [];
  const [plan] = await tx
    .select()
    .from(sessionPlans)
    .where(eq(sessionPlans.sessionId, sessionId));
  const cast = await tx
    .select({
      id: g.characters.id,
      name: g.characters.name,
      description: g.characters.description,
      kind: g.characters.kind,
    })
    .from(g.characters)
    .where(
      and(
        eq(g.characters.campaignId, campaignId),
        eq(g.characters.known, true),
      ),
    );
  const selection = (await registry.guidedRelease(campaignId, tx))
    ? await guidedParty(campaignId, tx)
    : null;
  const mounts = await tx
    .select({ id: g.campaignMounts.characterId })
    .from(g.campaignMounts)
    .where(eq(g.campaignMounts.campaignId, campaignId));
  const candidates: MentionCandidate[] = cast
    .filter((c) => !mounts.some((mount) => mount.id === c.id))
    .filter(
      (c) =>
        !selection ||
        c.kind !== 'COMPANION' ||
        selection.companionIds.includes(c.id),
    )
    .map((c) => ({
      type: 'CHARACTER',
      entityId: c.id,
      label: c.name,
      availability: plan?.plan.presentCharacterIds.includes(c.id)
        ? 'PRESENT'
        : 'KNOWN',
      context:
        c.kind === 'PROTAGONIST'
          ? 'Protagonista'
          : plan?.plan.presentCharacterIds.includes(c.id)
            ? 'Na cena'
            : 'Conhecido; fora da cena',
    }));
  const pc = cast.find((c) => c.kind === 'PROTAGONIST');
  if (pc) {
    const items = await tx
      .select({ id: g.gameItems.id, name: g.gameItems.name })
      .from(g.inventory)
      .innerJoin(g.gameItems, eq(g.gameItems.id, g.inventory.itemId))
      .where(
        and(
          eq(g.inventory.campaignId, campaignId),
          eq(g.inventory.characterId, pc.id),
          gt(g.inventory.quantity, 0),
          inArray(g.gameItems.visibility, ['PUBLIC', 'PLAYER_ONLY']),
        ),
      );
    candidates.push(
      ...items.map((i): MentionCandidate => ({
        type: 'ITEM',
        entityId: i.id,
        label: i.name,
        availability: 'INVENTORY',
        context: 'Seu inventário',
      })),
    );
  }
  if (await travelPending(sessionId, tx)) return candidates;
  const objects = await tx
    .select({ id: g.worldEntities.id, name: g.worldEntities.name })
    .from(g.worldEntities)
    .where(
      and(
        eq(g.worldEntities.campaignId, campaignId),
        eq(g.worldEntities.kind, 'OBJECT'),
        eq(g.worldEntities.accessible, true),
        inArray(g.worldEntities.visibility, ['PUBLIC', 'PLAYER_ONLY']),
      ),
    );
  candidates.push(
    ...objects.map((o): MentionCandidate => ({
      type: 'WORLD',
      entityId: o.id,
      label: o.name,
      availability: 'SCENE',
      context: 'Objeto acessível',
    })),
  );
  const loaded = await loadAdventure(campaignId, tx);
  if (loaded) {
    const known = await tx
      .select()
      .from(adventureCast)
      .where(
        and(
          eq(adventureCast.campaignId, campaignId),
          eq(adventureCast.known, true),
        ),
      );
    const [runtime] = await tx
      .select()
      .from(adventureScenes)
      .where(eq(adventureScenes.sessionId, sessionId));
    const spatial = await spatialState(loaded, tx);
    const scene = session.startedAt
      ? (loaded.definition.scenes.find(
          (s) =>
            s.key === runtime?.sceneKey &&
            (!spatial?.current || s.locationKey === spatial.current),
        ) ??
        (spatial?.current
          ? { key: '', locationKey: spatial.current, characterKeys: [] }
          : undefined))
      : undefined;
    const integrity = await registry
      .forDefinition(loaded.definition)
      .scenePolicy?.read(loaded, tx);
    for (const state of known) {
      const card = loaded.definition.characters.find(
        (c) => c.key === state.key && c.identityKind === 'INDIVIDUAL',
      );
      if (!card) continue;
      const position =
        scene && integrity ? integrity.presence(scene, card.key) : null;
      const present = position
        ? position.present && position.canSpeak
        : !!scene?.characterKeys.some((key) => key === card.key);
      candidates.push({
        type: 'CHARACTER',
        entityId: adventureEntityId(
          campaignId,
          card.key,
          loaded.instance.entityNamespace,
        ),
        label: card.name,
        availability: present ? 'PRESENT' : 'KNOWN',
        context: present ? 'Na cena' : 'Conhecido; fora da cena',
      });
    }
  }
  for (const candidate of candidates) {
    if (
      candidates.filter(
        (other) =>
          other.type === candidate.type &&
          normalizeName(other.label) === normalizeName(candidate.label),
      ).length > 1
    ) {
      const character = cast.find((c) => c.id === candidate.entityId);
      if (character?.description)
        candidate.context =
          `${candidate.context} · ${character.description}`.slice(0, 200);
    }
  }
  const priority = { PRESENT: 0, INVENTORY: 0, SCENE: 1, KNOWN: 2 };
  return candidates.sort(
    (a, b) =>
      priority[a.availability] - priority[b.availability] ||
      a.label.localeCompare(b.label, 'pt-BR') ||
      a.entityId.localeCompare(b.entityId),
  );
}
export async function validateMentions(
  campaignId: string,
  sessionId: string,
  content: string,
  mentions: ResolvedMention[],
  tx: Reader,
  registry: AdventureRegistry,
) {
  if (!mentions.length) return;
  const authorized = await authorizedMentions(
    campaignId,
    sessionId,
    tx,
    registry,
  );
  if (
    !validMentionSpans(content, mentions) ||
    mentions.some(
      (m) =>
        !authorized.some(
          (c) =>
            c.type === m.type &&
            c.entityId === m.entityId &&
            c.label === m.label,
        ),
    )
  )
    throw new BadRequestException(
      'Mention is inconsistent or no longer available in this context',
    );
}
export function filterMentions(
  candidates: MentionCandidate[],
  symbol: '@' | '#',
  query: string,
) {
  const filtered = candidates.filter(
    (c) =>
      (symbol === '@' ? c.type === 'CHARACTER' : c.type !== 'CHARACTER') &&
      normalizeName(c.label).includes(normalizeName(query)),
  );
  return { data: filtered.slice(0, 20), hasMore: filtered.length > 20 };
}
