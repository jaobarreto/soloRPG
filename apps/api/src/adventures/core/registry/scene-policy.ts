import type { AdventureExecutionContext } from './registry';
import type { AdventureDefinition } from '../definitions/definition';
import type { LoadedAdventure, Reader } from '../state/state';
import type { DatabaseTransaction } from '../../../database/database.service';

export type Scene = Pick<
  AdventureDefinition['scenes'][number],
  'key' | 'locationKey' | 'characterKeys'
>;

export interface ScenePolicy {
  confirm?(
    input:
      | { operation: 'CONFIRM_REVELATION'; revelation: string; reason: string }
      | {
          operation: 'CONFIRM_CAST_PRESENCE';
          characterKey: string;
          present: boolean;
          canSpeak: boolean;
          reason: string;
        },
    loaded: LoadedAdventure,
    scene: Scene,
    tx: DatabaseTransaction,
    emit: AdventureExecutionContext['emit'],
  ): Promise<{ id: string; confirmed: boolean }>;
  read(
    loaded: LoadedAdventure,
    tx: Reader,
  ): Promise<{
    presence(
      scene: Scene,
      key: string,
    ): { present: boolean; canSpeak: boolean };
    identifies(scene: Scene, key: string): boolean;
    describe(location: AdventureDefinition['locations'][number]): string;
    activate?(
      scene: Scene,
      sessionId: string,
      tx: DatabaseTransaction,
    ): Promise<void>;
  }>;
}
