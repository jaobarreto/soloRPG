import { BadRequestException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import * as a from '../../../../database/adventure-schema';
import * as g from '../../../../database/game-schema';
import { characterKnowledge } from '../../../../database/narrative-schema';
import { adventureEntityId } from '../../../core/state/identity';
import type { ScenePolicy } from '../../../core/registry/scene-policy';
import {
  integrityEventType,
  readNarrativeIntegrity,
  revelationKey,
  revelations,
  scenePresence,
} from '../state/narrative-integrity';

export const confirmNarrativeState: NonNullable<
  ScenePolicy['confirm']
> = async (input, loaded, scene, tx, emit) => {
  const { campaignId } = loaded.instance;
  const state = await readNarrativeIntegrity(campaignId, tx);
  if (input.operation === 'CONFIRM_CAST_PRESENCE') {
    const card = loaded.definition.characters.find(
      (c) => c.key === input.characterKey && c.identityKind === 'INDIVIDUAL',
    );
    if (
      !card ||
      (!input.present && input.canSpeak) ||
      (card.key === 'jaymes' && state.jaymesBanished) ||
      (card.key === 'chant' &&
        input.present &&
        !state.revealed.has('chant-found') &&
        (scene.key !== 'chant-talk' || state.presence.has('chant'))) ||
      (!scenePresence(scene, card.key, state).present && !input.present)
    )
      throw new BadRequestException('Invalid confirmed cast presence');
    const event = await emit(integrityEventType, input.reason, 'GM_ONLY', {
      presence: {
        characterKey: card.key,
        location: input.present ? scene.locationKey : null,
        canSpeak: input.canSpeak,
      },
    });
    return { id: event.id, confirmed: true };
  } else {
    const parsed = revelationKey.safeParse(input.revelation);
    if (!parsed.success)
      throw new BadRequestException('Unsupported adventure command');
    const fact = revelations[parsed.data];
    if (
      fact.scene !== scene.key ||
      state.revealed.has(parsed.data) ||
      ('identifies' in fact &&
        fact.identifies !== 'chant' &&
        !scenePresence(scene, fact.identifies, state).present)
    )
      throw new BadRequestException(
        'Revelation requires its current source scene and an undisclosed fact',
      );
    const event = await emit('ADVENTURE_REVELATION', fact.text, 'PUBLIC', {});
    await emit(integrityEventType, input.reason, 'GM_ONLY', {
      revelation: input.revelation,
      sourcePages: fact.pages,
      publicEventId: event.id,
      ...(input.revelation === 'chant-found'
        ? {
            presence: {
              characterKey: 'chant',
              location: scene.locationKey,
              canSpeak: true,
            },
          }
        : {}),
    });
    if ('identifies' in fact)
      await tx
        .update(a.adventureCast)
        .set({ known: true })
        .where(
          and(
            eq(a.adventureCast.campaignId, campaignId),
            eq(a.adventureCast.key, fact.identifies),
          ),
        );
    if ('location' in fact)
      await tx
        .update(g.worldEntities)
        .set({ description: fact.description })
        .where(
          and(
            eq(g.worldEntities.campaignId, campaignId),
            eq(
              g.worldEntities.id,
              adventureEntityId(
                campaignId,
                fact.location,
                loaded.instance.entityNamespace,
              ),
            ),
          ),
        );
    if (loaded.instance.protagonistId)
      await tx
        .insert(characterKnowledge)
        .values({
          campaignId: campaignId,
          characterId: loaded.instance.protagonistId,
          eventId: event.id,
          source: 'LOCAL_ATTESTED',
          importance: 70,
        })
        .onConflictDoNothing();
    return { id: event.id, confirmed: true };
  }
};
