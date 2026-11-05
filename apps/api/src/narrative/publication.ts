import type { Narration } from '@solo-rpg/shared-contracts';
import type { DatabaseTransaction } from '../database/database.service';
import type { MessagesRepository } from '../messages/messages.repository';

export async function publishNarration(
  messages: MessagesRepository,
  tx: DatabaseTransaction,
  scope: { campaignId: string; sessionId: string },
  narration: Narration,
  metadata: Record<string, unknown>,
) {
  return messages.insert(
    {
      ...scope,
      role: 'GAME_MASTER',
      content: narration.narrative,
      sequenceNumber: (await messages.lastSequence(scope.sessionId, tx)) + 1,
      metadata: { eventIds: narration.eventIds, ...metadata },
    },
    tx,
  );
}
