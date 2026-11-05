import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { DatabaseTransaction } from '../../../database/database.service';
import { gameCommands } from '../../../database/game-schema';
import type { Reader } from './state';
import { adventureEntityId, digest } from './identity';

const selection = z.object({
  keys: z.array(z.string()),
  companionIds: z.array(z.uuid()),
});
export type GuidedParty = z.infer<typeof selection>;

const key = (campaignId: string) =>
  adventureEntityId(campaignId, 'guided-party-v1', 'campaign-library');

export async function guidedParty(campaignId: string, tx: Reader) {
  const [row] = await tx
    .select({ result: gameCommands.result })
    .from(gameCommands)
    .where(
      and(
        eq(gameCommands.campaignId, campaignId),
        eq(gameCommands.commandId, key(campaignId)),
      ),
    );
  return row ? selection.parse(row.result) : null;
}

// Caller holds the campaign lock and has validated the reviewed sheets.
export async function recordGuidedParty(
  campaignId: string,
  party: GuidedParty,
  tx: DatabaseTransaction,
) {
  await tx.insert(gameCommands).values({
    campaignId,
    commandId: key(campaignId),
    digest: digest(party),
    result: party,
  });
}
