import type { DatabaseTransaction } from '../database/database.service';
import type { gameEvents } from '../database/game-schema';
import type { BlueRoseDiceResult } from '../blue-rose/blue-rose.rules';
export type Visibility = 'PUBLIC' | 'PLAYER_ONLY' | 'GM_ONLY';
export type Audit = {
  type: string;
  description: string;
  changes: Record<string, unknown>;
  participants?: string[];
  visibility?: Visibility;
};
export interface GameContext {
  campaignId: string;
  sessionId?: string;
  commandId: string;
  audience: 'PLAYER' | 'INTERNAL';
  tx: DatabaseTransaction;
  emit(audit: Audit): Promise<typeof gameEvents.$inferSelect>;
  recordRoll(
    result: BlueRoseDiceResult & {
      success: boolean | null;
      stuntPoints: number;
    },
    visibility: Visibility,
    reason: string,
    characterId?: string,
    requestId?: string,
  ): Promise<{ id: string }>;
}
