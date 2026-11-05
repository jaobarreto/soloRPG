import { gloamhaleGuidedRelease } from './guided-release';
import { confirmNarrativeState } from './runtime/commands/confirm-narrative-state';
import { gloamhaleScenePolicy } from './runtime/state/narrative-integrity';
import { gloamhaleNavigation } from './runtime/mechanics/navigation';
import { legacyEntityNamespace } from './default-adventure';
import { ConflictException } from '@nestjs/common';
import { gloamhaleState } from './runtime/state/mechanics-state';
import { eq } from 'drizzle-orm';
import { arcanaRequests, characterVitals } from '../../database/game-schema';
import { adventureInstances } from '../../database/adventure-schema';
import { gloamhale } from './definitions/v1/gloamhale';
import { suppliedParty } from './party/supplied-party';
import { gloamhaleCommandSchema } from './runtime/commands/gloamhale-commands';
import { applyGloamhale } from './runtime/mechanics/gloamhale-runtime';
import { gloamhalePublicEventTypes } from './runtime/mechanics/gloamhale-mechanics';
import type { AdventureModuleDefinition } from '../core/registry/registry';

export const gloamhaleModule: AdventureModuleDefinition = {
  definition: gloamhale,
  entityNamespace: legacyEntityNamespace,
  navigation: gloamhaleNavigation,
  publicEventTypes: gloamhalePublicEventTypes,
  sceneEndingKeys: Object.fromEntries(
    ['ritual', 'resolution'].map((key) => [
      key,
      gloamhale.endings.map((ending) => ending.key),
    ]),
  ),
  suppliedParty,
  narrativeOptions(raw, characterId) {
    const state = gloamhaleState(raw),
      ritual = state?.ritual;
    if (
      !ritual ||
      ritual.status !== 'ACTIVE' ||
      ritual.pending ||
      !ritual.partyIds.includes(characterId) ||
      state?.children[characterId]?.location !== 'MANOR'
    )
      return [];
    return [
      ...(['CANDLES', 'POEM', 'SHAPING'] as const).map((task) => ({
        label: `Ritual: ${{ CANDLES: 'manter as velas acesas', POEM: 'recitar o poema', SHAPING: 'conter o espírito' }[task]} (dispensar façanhas)`,
        command: {
          type: 'ADVENTURE_ACTION' as const,
          input: {
            action: 'RITUAL_ATTEMPT' as const,
            characterId,
            task,
            benefit: 'NONE' as const,
            declineStunts: true as const,
          },
        },
      })),
      {
        label: 'Interromper o ritual definitivamente',
        command: {
          type: 'ADVENTURE_ACTION' as const,
          input: { action: 'RITUAL_STOP' as const, characterId },
        },
      },
    ];
  },
  async executeNarrativeAction(input, envelope, context) {
    const reason =
      'Escolha mecânica explícita do ritual, validada pelo módulo da aventura.';
    const run = async (command: Record<string, unknown>) => {
      const [instance] = await context.tx
        .select()
        .from(adventureInstances)
        .where(eq(adventureInstances.campaignId, envelope.campaignId));
      return this.executeCommand!(
        { ...envelope, reason, ...command },
        { ...context, state: instance!.mechanics },
      );
    };
    if (input.action === 'RITUAL_STOP') {
      await run({ operation: 'GLOAMHALE_RITUAL_STOP' });
    } else {
      await run({
        operation: 'GLOAMHALE_RITUAL_ROLL',
        characterId: input.characterId,
        task: input.task,
        benefit: input.benefit,
        modifier: 0,
      });
      await run({
        operation: 'GLOAMHALE_RITUAL_RESOLVE',
        declineStunts: input.declineStunts,
      });
    }
  },
  commandSchema: gloamhaleCommandSchema,
  assertIdle(raw, operation) {
    if (
      gloamhaleState(raw)?.ritual?.pending &&
      !['GLOAMHALE_RITUAL_RESOLVE', 'GLOAMHALE_RITUAL_STOP'].includes(
        operation ?? '',
      )
    )
      throw new ConflictException('Resolve the pending ritual test first');
  },
  async validateEngineCommand(command, raw, tx) {
    const state = gloamhaleState(raw);
    if (command.type === 'ADVENTURE_ACTION') {
      this.assertIdle!(
        raw,
        command.input.action === 'RITUAL_STOP'
          ? 'GLOAMHALE_RITUAL_STOP'
          : 'GLOAMHALE_RITUAL_ROLL',
      );
      return;
    }
    this.assertIdle!(raw);
    if (command.type === 'COMBAT_START')
      throw new ConflictException(
        'Adventure encounter requires local adjudication; ordinary combat cannot resolve its special rules',
      );
    if (command.type === 'ABILITY_SET' && state?.children[command.characterId])
      throw new ConflictException(
        'Restore adult abilities before changing base scores',
      );
    if (
      command.type === 'RESOURCE_SET' &&
      command.name === 'HEALTH' &&
      command.current === 0 &&
      state?.children[command.characterId]?.location === 'MANOR'
    )
      throw new ConflictException(
        'Use GLOAMHALE_DAMAGE for the manor zero-Health exception',
      );
    if (
      command.type === 'ARCANA_CURE_PREPARE' ||
      command.type === 'ARCANA_CURE_RESOLVE' ||
      (command.type === 'ARCANA_USE' &&
        command.input.arcanum === 'move-object' &&
        command.input.fatigue)
    ) {
      // Resolution is revalidated, including requests prepared before a transformation.
      const characterId =
        command.type === 'ARCANA_CURE_PREPARE'
          ? command.characterId
          : command.type === 'ARCANA_USE'
            ? command.input.characterId
            : (
                await tx
                  .select()
                  .from(arcanaRequests)
                  .where(eq(arcanaRequests.id, command.requestId))
              )[0]?.characterId;
      if (characterId && state?.children[characterId]?.location === 'MANOR') {
        const [vitals] = await tx
          .select()
          .from(characterVitals)
          .where(eq(characterVitals.characterId, characterId));
        if (vitals && vitals.fatigueLevel >= 3)
          throw new ConflictException(
            'Exhaustion interacting with the manor requires local adjudication before casting',
          );
      }
    }
  },
  async advanceTime(input, context) {
    const state = gloamhaleState(context.state);
    if (!state || !Object.keys(state.children).length) return;
    await applyGloamhale(
      { ...input, operation: 'GLOAMHALE_TIME' },
      context.definition,
      state,
      context.tx,
      context.dice,
      context.emit,
    );
  },
  commandDurationMinutes(input) {
    const command = gloamhaleCommandSchema.parse(input);
    return command.operation === 'GLOAMHALE_TIME' ? command.minutes : 0;
  },
  executeCommand(input, context) {
    return applyGloamhale(
      gloamhaleCommandSchema.parse(input),
      context.definition,
      gloamhaleState(context.state),
      context.tx,
      context.dice,
      context.emit,
    );
  },
};

export function gloamhaleVersion(
  definition: AdventureModuleDefinition['definition'],
): AdventureModuleDefinition {
  return {
    ...gloamhaleModule,
    definition,
    interactivePreparation: definition.version === 5,
    ...(definition.version === 5 && { guidedRelease: gloamhaleGuidedRelease }),
    ...(definition.version >= 4 && {
      scenePolicy: { ...gloamhaleScenePolicy, confirm: confirmNarrativeState },
    }),
  };
}
