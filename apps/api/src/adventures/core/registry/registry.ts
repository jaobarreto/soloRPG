import type { SceneObjectRelease } from '../objects/scene-objects';
import { eq } from 'drizzle-orm';
import { librarySessionResets } from '../../../database/library-schema';
import type { Reader } from '../state/state';
import type { AdventurePlanning } from '../director/planning';
import type { ScenePolicy } from './scene-policy';
import type { NavigationPolicy } from '../navigation/navigate';
import { ConflictException, NotFoundException } from '@nestjs/common';
import type { ZodType } from 'zod';
import type { AdventureDefinition } from '../definitions/definition';
import { adventureDefinitionSchema } from '../definitions/definition';
import type { DatabaseTransaction } from '../../../database/database.service';
import type { EngineCommand } from '../../../game-engine/commands';
import type { BlueRoseDice } from '../../../blue-rose/mechanics/dice/blue-rose-dice';
import type { gameEvents } from '../../../database/game-schema';
import type { sheetSnapshot } from '../state/state';
import type { createCharacterSchema } from '@solo-rpg/shared-contracts';
import type {
  AdventureAction,
  MechanicalAction,
  weaponRuleIds,
} from '@solo-rpg/shared-contracts';
import type { z } from 'zod';

export type PartySnapshot = Awaited<ReturnType<typeof sheetSnapshot>>;
export interface AdventureExecutionContext {
  definition: AdventureDefinition;
  state: Record<string, unknown> | null;
  tx: DatabaseTransaction;
  dice: BlueRoseDice;
  emit(
    type: string,
    description: string,
    visibility: 'PUBLIC' | 'GM_ONLY',
    changes: Record<string, unknown>,
  ): Promise<typeof gameEvents.$inferSelect>;
}
export interface GuidedRelease {
  campaignId: string;
  genre: string;
  system: string;
  narrator: string;
  presentation: string;
  releasedSessions: readonly number[];
  interactionPhrases?: Readonly<Record<string, string[]>>;
  planning?: AdventurePlanning;
  // First is the published revision. Keep earlier releases for pinned campaigns.
  sceneObjects?: readonly SceneObjectRelease[];
  opening:
    | { revision: string; source: 'CANONICAL_SCENE' }
    | {
        revision: string;
        source: 'APPROVED_TEXT';
        sceneKey: string;
        text: string;
        planningRevision?: string;
      };
  directRoute?: {
    revision: string;
    sceneKey: string;
    contactOptionKey: string;
    optionKey: string;
    factKey: string;
    intent: string;
    playerText: string;
    receipt: string;
  };
  companions: Readonly<
    Record<string, { role: string; personality: string; presentation: string }>
  >;
}
export interface AdventureModuleDefinition {
  definition: AdventureDefinition;
  entityNamespace: string;
  scenePolicy?: ScenePolicy;
  interactivePreparation?: boolean;
  guidedRelease?: GuidedRelease;
  navigation?: NavigationPolicy;
  publicEventTypes?: readonly string[];
  sceneEndingKeys?: Readonly<Record<string, readonly string[]>>;
  validateParty?(snapshot: PartySnapshot): string[];
  validateEngineCommand?(
    command: EngineCommand,
    state: Record<string, unknown> | null,
    tx: DatabaseTransaction,
  ): Promise<void>;
  advanceTime?(
    input: {
      campaignId: string;
      sessionId: string;
      commandId: string;
      minutes: number;
      reason: string;
    },
    context: AdventureExecutionContext,
  ): Promise<void>;
  commandDurationMinutes?(input: unknown): number;
  narrativeOptions?(
    state: Record<string, unknown> | null,
    characterId: string,
  ): { label: string; command: MechanicalAction }[];
  executeNarrativeAction?(
    input: AdventureAction,
    envelope: { campaignId: string; sessionId: string; commandId: string },
    context: AdventureExecutionContext,
  ): Promise<void>;
  assertIdle?(state: Record<string, unknown> | null, operation?: string): void;
  commandSchema?: ZodType<{
    operation: string;
    campaignId: string;
    sessionId: string;
    commandId: string;
  }>;
  executeCommand?(
    input: unknown,
    context: AdventureExecutionContext,
  ): Promise<Record<string, unknown>>;
  suppliedParty?: readonly {
    key: string;
    source: string;
    kind: 'PROTAGONIST' | 'COMPANION';
    initialState?: string;
    weaponName?: string;
    sheet: Omit<z.input<typeof createCharacterSchema>, 'commandId'>;
    armor: 'NONE' | 'LIGHT' | 'MEDIUM' | 'HEAVY';
    shield: 'NONE' | 'LIGHT' | 'MEDIUM' | 'HEAVY';
    weapon:
      | 'heavy-blade'
      | 'light-blade'
      | 'staff'
      | 'longbow'
      | 'shortbow'
      | 'sling';
    personality: string;
    motivations: string;
    privateNotes?: string;
    weaponTraining?: readonly (typeof weaponRuleIds)[number][];
  }[];
}

// Explicit registration at the composition root. No content imports or dynamic code loading.
type AdventureReference = Pick<AdventureDefinition, 'id' | 'version'>;
export interface AdventureDefaults {
  legacyImport: AdventureReference;
  newCampaign: AdventureReference;
}

export class AdventureRegistry {
  private readonly modules = new Map<string, AdventureModuleDefinition>();
  constructor(
    modules: readonly AdventureModuleDefinition[],
    private readonly defaults?: AdventureDefaults,
  ) {
    for (const module of modules) {
      const definition = adventureDefinitionSchema.parse(module.definition);
      const key = `${definition.id}:v${definition.version}`;
      if (!/^[a-z][a-z0-9-]{0,99}$/.test(module.entityNamespace))
        throw new ConflictException('Invalid adventure entity namespace');
      if (!!module.commandSchema !== !!module.executeCommand)
        throw new ConflictException(
          'Adventure commands require schema and executor',
        );
      const release = module.guidedRelease;
      if (
        release?.planning &&
        (release.planning.definitionId !== key ||
          release.releasedSessions.some(
            (number) =>
              !definition.sessions.some(
                (session) => session.number === number,
              ) || !release.planning!.sessions[number - 1]?.operational,
          ))
      )
        throw new ConflictException(
          'Editorial release must reference a compatible implemented session',
        );
      if (release?.sceneObjects) {
        const revisions = release.sceneObjects;
        if (
          new Set(revisions.map((revision) => revision.revision)).size !==
            revisions.length ||
          revisions.some(
            ({ objects }) =>
              new Set(objects.map((object) => object.key)).size !==
                objects.length ||
              objects.some(
                (object) =>
                  !definition.spatial?.places.some(
                    (place) => place.key === object.locationKey,
                  ),
              ),
          )
        )
          throw new ConflictException(
            'Object release requires unique keys and registered locations',
          );
      }
      if (this.modules.has(key))
        throw new ConflictException('Duplicate adventure version');
      this.modules.set(key, { ...module, definition });
    }
  }
  get(id: string, version: number) {
    const module = this.modules.get(`${id}:v${version}`);
    if (!module)
      throw new NotFoundException('Adventure version is not registered');
    return module;
  }
  forImport(id?: string, version?: number) {
    const adventureId = id ?? this.defaults?.legacyImport.id;
    if (!adventureId)
      throw new NotFoundException('Adventure version is not registered');
    return this.get(
      adventureId,
      version ?? this.defaults?.legacyImport.version ?? 1,
    );
  }
  forNewCampaign() {
    const reference = this.defaults?.newCampaign;
    if (!reference)
      throw new NotFoundException('Adventure version is not registered');
    return this.get(reference.id, reference.version);
  }
  library() {
    const module = [...this.modules.values()].find(
      (entry) => entry.guidedRelease,
    );
    if (!module?.guidedRelease)
      throw new NotFoundException('Nenhuma aventura disponível na biblioteca.');
    return { module, release: module.guidedRelease };
  }
  async guidedRelease(campaignId: string, reader: Reader) {
    const releases = [...this.modules.values()].flatMap((entry) =>
      entry.guidedRelease ? [entry.guidedRelease] : [],
    );
    const original = releases.find(
      (release) => release.campaignId === campaignId,
    );
    if (original || !releases.length) return original;
    const [replacement] = await reader
      .select({ slotId: librarySessionResets.slotId })
      .from(librarySessionResets)
      .where(eq(librarySessionResets.replacementCampaignId, campaignId));
    return releases.find(
      (release) => release.campaignId === replacement?.slotId,
    );
  }
  forDefinition(definition: AdventureDefinition) {
    return this.get(definition.id, definition.version);
  }
}
