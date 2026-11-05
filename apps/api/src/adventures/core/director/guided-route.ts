import { ConflictException } from '@nestjs/common';
import { gameEvents } from '../../../database/game-schema';
import type { DatabaseTransaction } from '../../../database/database.service';
import type { GuidedRelease } from '../registry/registry';
import type { LoadedAdventure } from '../state/state';
import { directorState } from './director';

export async function confirmGuidedRoute(
  loaded: LoadedAdventure,
  scope: { sessionId: string; actionId: string; routeEventId: string },
  route: NonNullable<GuidedRelease['directRoute']>,
  tx: DatabaseTransaction,
) {
  const state = await directorState(loaded, scope.sessionId, tx);
  const fact = loaded.definition.progression?.facts.find(
    (entry) => entry.key === route.factKey && entry.unitKey === state?.unit.key,
  );
  const contact = state?.evidence.find(
    (entry) =>
      entry.sceneKey === route.sceneKey &&
      entry.optionKey === route.contactOptionKey &&
      entry.success,
  );
  if (!fact || !contact)
    throw new ConflictException(
      'A escolha da rota exige contato confirmado na estrada.',
    );

  if (!state?.evidence.some((entry) => entry.fact === fact.key))
    await tx.insert(gameEvents).values({
      campaignId: loaded.instance.campaignId,
      sessionId: scope.sessionId,
      commandId: scope.actionId,
      type: 'NARRATIVE_FACT_CONFIRMED',
      description: route.receipt,
      visibility: 'GM_ONLY',
      changes: {
        definitionId: loaded.instance.definitionId,
        factKey: fact.key,
        evidenceEventIds: [contact.id, scope.routeEventId],
        policyRevision: route.revision,
      },
    });
}
