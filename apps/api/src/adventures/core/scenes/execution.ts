import { campaignSessions } from '../../../database/schema';
import { guidedParty } from '../state/guided-party';
import { activateAdventureScene } from './scene-state';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  scenePlanSchema,
  type StoryCardDialogueManifest,
} from '@solo-rpg/shared-contracts';
import * as a from '../../../database/adventure-schema';
import * as g from '../../../database/game-schema';
import { sessionPlans } from '../../../database/narrative-schema';
import type { DatabaseTransaction } from '../../../database/database.service';
import type { AdventureRegistry } from '../registry/registry';
import { storyManifestForScope } from './story-dialogue';
import { adventureEntityId, loadAdventure } from '../state/state';

// Caller holds campaign → session locks. Preparation never begins a session.
export async function prepareAdventureScene(
  loaded: NonNullable<Awaited<ReturnType<typeof loadAdventure>>>,
  session: { id: string; status: string },
  sceneKey: string,
  tx: DatabaseTransaction,
  registry: AdventureRegistry,
  presentCompanionIds?: string[],
  requestedManifest?: StoryCardDialogueManifest | null,
) {
  const campaign = { id: loaded.instance.campaignId };
  if (loaded.planning) {
    const [entry] = await tx
      .select({ number: campaignSessions.sessionNumber })
      .from(campaignSessions)
      .where(
        and(
          eq(campaignSessions.id, session.id),
          eq(campaignSessions.campaignId, campaign.id),
        ),
      );
    if (
      !entry ||
      !loaded.planning.sessions[
        entry.number - 1
      ]?.operational?.sceneKeys.includes(sceneKey)
    )
      throw new ConflictException(
        'Esta cena está fora da sessão disponibilizada.',
      );
  }
  const scene = loaded.definition.scenes.find((s) => s.key === sceneKey);
  if (!scene) throw new BadRequestException('Unknown source scene');
  const pc = loaded.instance.protagonistId;
  if (!pc) throw new ConflictException('Review the protagonist first');
  const companions = await tx
    .select({ id: g.characters.id })
    .from(g.characters)
    .innerJoin(
      g.characterVitals,
      eq(g.characterVitals.characterId, g.characters.id),
    )
    .where(
      and(
        eq(g.characters.campaignId, campaign.id),
        eq(g.characters.kind, 'COMPANION'),
        eq(g.characters.known, true),
        eq(g.characterVitals.lifeState, 'ALIVE'),
      ),
    );
  const selection = (await registry.guidedRelease(campaign.id, tx))
    ? await guidedParty(campaign.id, tx)
    : null;
  const available = companions
    .map((c) => c.id)
    .filter((id) => !selection || selection.companionIds.includes(id));
  const companionIds = presentCompanionIds ?? available;
  if (companionIds.some((id) => !available.includes(id)))
    throw new BadRequestException(
      'Companions must be alive and belong to this campaign',
    );
  await tx
    .insert(a.adventureScenes)
    .values({
      campaignId: campaign.id,
      sessionId: session.id,
      sceneKey: scene.key,
    })
    .onConflictDoUpdate({
      target: a.adventureScenes.sessionId,
      set: { sceneKey: scene.key },
    });
  const [previousPlan] = await tx
    .select()
    .from(sessionPlans)
    .where(eq(sessionPlans.sessionId, session.id));
  let storyCardDialogue;
  const candidate =
    requestedManifest === undefined
      ? previousPlan?.plan.storyCardDialogue
      : requestedManifest;
  if (candidate) {
    const [reference] = await tx
      .select({ hash: a.adventureDefinitions.digest })
      .from(a.adventureDefinitions)
      .where(eq(a.adventureDefinitions.id, loaded.instance.definitionId));
    storyCardDialogue = storyManifestForScope(candidate, {
      campaignId: campaign.id,
      definitionId: loaded.instance.definitionId,
      definition: loaded.definition,
      registeredNamespace: registry.forDefinition(loaded.definition)
        .entityNamespace,
      registeredDefinition: registry.forDefinition(loaded.definition)
        .definition,
      storedDigest: reference?.hash ?? '',
      entityNamespace: loaded.instance.entityNamespace,
      sceneKey,
    });
  }
  const route = (await registry.guidedRelease(campaign.id, tx))?.directRoute;
  const routeOption =
    route?.sceneKey === scene.key
      ? [
          {
            id: adventureEntityId(
              campaign.id,
              `option-${scene.key}-${route.optionKey}`,
              loaded.instance.entityNamespace,
            ),
            requiresOptionIds: [
              adventureEntityId(
                campaign.id,
                `option-${scene.key}-${route.contactOptionKey}`,
                loaded.instance.entityNamespace,
              ),
            ],
            intent: route.intent,
            mode: 'ACT',
            keywords: [route.playerText],
            check: null,
            successText: route.receipt,
            failureText: route.receipt,
            effects: [],
            witnesses: companionIds,
          },
        ]
      : [];
  const plan = scenePlanSchema.parse({
    ...(storyCardDialogue ? { storyCardDialogue } : {}),
    opening: scene.opening,
    presentCharacterIds: [pc, ...new Set(companionIds)],
    options: [
      ...scene.options.map((o) => ({
        id: adventureEntityId(
          campaign.id,
          `option-${scene.key}-${o.key}`,
          loaded.instance.entityNamespace,
        ),
        durationMinutes: o.durationMinutes,
        nextSceneKey: o.nextSceneKey,
        arcana: o.arcana,
        intent: o.intent,
        mode: o.mode,
        keywords: o.keywords,
        check: o.check ? { ...o.check, focusId: null, secret: false } : null,
        successText: o.successText,
        failureText: o.failureText,
        effects: o.worldStatus
          ? [
              {
                type: 'WORLD_STATUS',
                entityId: adventureEntityId(
                  campaign.id,
                  scene.locationKey,
                  loaded.instance.entityNamespace,
                ),
                expectedStatus: o.worldStatus.expected,
                status: o.worldStatus.next,
                accessible: true,
              },
            ]
          : [],
        witnesses: companionIds,
      })),
      ...routeOption,
    ],
    objectives: [],
  });
  await tx
    .insert(sessionPlans)
    .values({ campaignId: campaign.id, sessionId: session.id, plan })
    .onConflictDoUpdate({
      target: sessionPlans.sessionId,
      set: { plan },
    });
  if (session.status === 'IN_PROGRESS')
    await activateAdventureScene(campaign.id, session.id, tx, registry);

  return scene;
}
