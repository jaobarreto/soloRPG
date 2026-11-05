import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  arcaneContextSchema,
  abilities,
  type ArcanaUse,
  type ArcaneContext,
} from '@solo-rpg/shared-contracts';
import * as s from '../../database/game-schema';
import * as a from '../../database/arcana-schema';
import { GameRepository } from '../../database/game.repository';
import type { GameContext } from '../../game-engine/context';
import type { EngineCommand } from '../../game-engine/commands';
import { BlueRoseDice } from '../mechanics/dice/blue-rose-dice';
import { resolveBasicCheck } from '../mechanics/tests/basic-check.rules';
import { BlueRoseCombatService } from '../mechanics/combat/combat.service';
import {
  bodyControlDifficulty,
  moveObjectRule,
  sightInformation,
  windChange,
} from './arcana.rules';

@Injectable()
export class BlueRoseArcanaExecutionService {
  constructor(
    private readonly repository: GameRepository,
    private readonly dice: BlueRoseDice,
    private readonly combat: BlueRoseCombatService,
  ) {}
  async endSustained(characterId: string, reason: string, ctx: GameContext) {
    const effects = await ctx.tx
      .update(a.arcaneEffects)
      .set({ active: false })
      .where(
        and(
          eq(a.arcaneEffects.campaignId, ctx.campaignId),
          eq(a.arcaneEffects.characterId, characterId),
          eq(a.arcaneEffects.active, true),
          eq(a.arcaneEffects.sustained, true),
        ),
      )
      .returning({ id: a.arcaneEffects.id });
    if (effects.length)
      await ctx.emit({
        type: 'ARCANA_ENDED',
        description: reason,
        participants: [characterId],
        changes: { effectIds: effects.map((e) => e.id) },
      });
  }
  async requireNoSustainedEffects(ctx: GameContext) {
    const [effect] = await ctx.tx
      .select({ id: a.arcaneEffects.id })
      .from(a.arcaneEffects)
      .where(
        and(
          eq(a.arcaneEffects.campaignId, ctx.campaignId),
          eq(a.arcaneEffects.active, true),
          eq(a.arcaneEffects.sustained, true),
        ),
      );
    if (effect)
      throw new ConflictException(
        'Exceptional adjudication: end sustained arcana before combat; Concentrate actions are not automated',
      );
  }
  async endIfIncapacitated(characterId: string, ctx: GameContext) {
    const [vitals] = await ctx.tx
      .select()
      .from(s.characterVitals)
      .where(eq(s.characterVitals.characterId, characterId));
    const [health] = await ctx.tx
      .select()
      .from(s.characterResources)
      .where(
        and(
          eq(s.characterResources.characterId, characterId),
          eq(s.characterResources.name, 'HEALTH'),
        ),
      );
    if (vitals?.lifeState !== 'ALIVE' || !health?.current)
      await this.endSustained(
        characterId,
        'A incapacidade encerrou a concentração arcana.',
        ctx,
      );
  }

  async apply(
    command: EngineCommand,
    ctx: GameContext,
  ): Promise<{ id: string }> {
    if (!ctx.sessionId) throw new ConflictException('Session required');
    if (command.type === 'ARCANA_CONTEXT_SET') {
      await this.repository.character(
        ctx.campaignId,
        command.characterId,
        ctx.tx,
      );
      const [existing] = await ctx.tx
        .select()
        .from(a.arcaneContexts)
        .where(eq(a.arcaneContexts.id, command.contextId));
      if (
        existing &&
        (existing.campaignId !== ctx.campaignId ||
          existing.characterId !== command.characterId)
      )
        throw new ConflictException('Context identity already in use');
      if (command.value.kind === 'CREATURE')
        await this.repository.character(
          ctx.campaignId,
          command.value.targetId,
          ctx.tx,
        );
      if (command.value.kind === 'TRACE' && command.value.casterId)
        await this.repository.character(
          ctx.campaignId,
          command.value.casterId,
          ctx.tx,
        );
      await ctx.tx
        .insert(a.arcaneContexts)
        .values({
          id: command.contextId,
          campaignId: ctx.campaignId,
          sessionId: ctx.sessionId,
          characterId: command.characterId,
          preparedFor: ctx.sceneScope ?? 'NO_SCENE',
          value: command.value,
        })
        .onConflictDoUpdate({
          target: a.arcaneContexts.id,
          set: {
            sessionId: ctx.sessionId,
            preparedFor: ctx.sceneScope ?? 'NO_SCENE',
            value: command.value,
          },
        });
      await ctx.emit({
        type: 'ARCANE_CONTEXT_PREPARED',
        description: command.reason,
        changes: { contextId: command.contextId },
        visibility: 'GM_ONLY',
      });
      return { id: command.contextId };
    }
    if (command.type === 'ARCANA_END') {
      const [effect] = await ctx.tx
        .select()
        .from(a.arcaneEffects)
        .where(
          and(
            eq(a.arcaneEffects.id, command.effectId),
            eq(a.arcaneEffects.campaignId, ctx.campaignId),
            eq(a.arcaneEffects.characterId, command.characterId),
          ),
        );
      if (!effect) throw new NotFoundException('Effect not found');
      if (!effect.sustained)
        throw new BadRequestException(
          'Use the arcanum choice to change a passive shield',
        );
      await ctx.tx
        .update(a.arcaneEffects)
        .set({ active: false })
        .where(eq(a.arcaneEffects.id, effect.id));
      await ctx.emit({
        type: 'ARCANA_ENDED',
        description: 'Concentração encerrada voluntariamente.',
        participants: [effect.characterId],
        changes: { effectId: effect.id },
      });
      return { id: effect.id };
    }
    if (command.type !== 'ARCANA_USE')
      throw new BadRequestException('Unsupported arcanum command');
    const input = command.input;
    const actor = await this.repository.character(
      ctx.campaignId,
      input.characterId,
      ctx.tx,
    );
    const stats = await this.data(actor.id, ctx);
    if (
      stats.vitals.lifeState !== 'ALIVE' ||
      stats.health.current === 0 ||
      stats.vitals.fatigueLevel >= 4
    )
      throw new ConflictException('Caster cannot act');
    const features = await ctx.tx
      .select()
      .from(s.characterFeatures)
      .where(eq(s.characterFeatures.characterId, actor.id));
    const has = (id: string) => features.some((f) => f.ruleId === id);
    const focus = (id: string) => {
      const f = features.find((f) => f.ruleId === id);
      return f ? (f.improved ? 3 : 2) : 0;
    };
    if (!has(input.arcanum))
      throw new BadRequestException('Known arcanum required');
    const talents = [
      'animism',
      'healing',
      'meditative',
      'psychic',
      'shaping',
      'visionary',
    ];
    const requireTalent = (name?: string) => {
      if (
        name ? !has(`${name}-talent`) : !talents.some((t) => has(`${t}-talent`))
      )
        throw new BadRequestException('Appropriate arcane talent required');
    };
    if (!['psychic-shield', 'second-sight'].includes(input.arcanum)) {
      const [existing] = await ctx.tx
        .select()
        .from(a.arcaneEffects)
        .where(
          and(
            eq(a.arcaneEffects.campaignId, ctx.campaignId),
            eq(a.arcaneEffects.characterId, actor.id),
            eq(a.arcaneEffects.arcanum, input.arcanum),
            eq(a.arcaneEffects.active, true),
          ),
        );
      if (existing)
        throw new ConflictException(
          'End the existing effect before casting again',
        );
    }
    if (await this.combat.active(ctx.campaignId, ctx.tx)) {
      // Concentration/action/reaction rules must be implemented before these casts enter combat.
      if (input.arcanum !== 'psychic-shield')
        throw new ConflictException(
          'Exceptional adjudication: this arcanum is currently narrative only',
        );
      await this.combat.consumeAction(actor.id, 'FREE', ctx);
    }
    const check = async (
      ability: string,
      focusId: string,
      tn: number,
      secret = false,
    ) => {
      const score = stats.abilities[ability as keyof typeof stats.abilities];
      if (score === undefined)
        throw new ConflictException('Incomplete abilities');
      const roll = this.dice.roll(
        score + focus(focusId) - stats.vitals.fatigueLevel,
      );
      const result = resolveBasicCheck(roll, tn, false);
      await ctx.recordRoll(
        { ...roll, ...result },
        secret ? 'GM_ONLY' : 'PUBLIC',
        input.arcanum,
        actor.id,
      );
      return { ...roll, ...result };
    };
    const effect = async (
      targetId: string,
      value: Record<string, unknown>,
      sustained = true,
    ) => {
      const [row] = await ctx.tx
        .insert(a.arcaneEffects)
        .values({
          campaignId: ctx.campaignId,
          characterId: actor.id,
          targetId,
          arcanum: input.arcanum,
          sustained,
          value,
        })
        .returning();
      await ctx.emit({
        type: 'ARCANA_EFFECT_APPLIED',
        description: `${{ 'psychic-shield': 'Escudo Psíquico', 'body-control': 'Controle Corporal', 'psychic-contact': 'Contato Psíquico', 'move-object': 'Mover Objeto', 'wind-shaping': 'Moldar Vento', 'second-sight': 'Segunda Visão' }[input.arcanum]}: efeito confirmado pelo motor.`,
        participants: [actor.id, targetId],
        changes: { effectId: row!.id, arcanum: input.arcanum, ...value },
      });
      return { id: row!.id };
    };
    const failed = async () => ({
      id: (
        await ctx.emit({
          type: 'ARCANA_FAILED',
          description: 'O teste arcano falhou; nenhum efeito foi aplicado.',
          participants: [actor.id],
          changes: { arcanum: input.arcanum },
        })
      ).id,
    });
    if (input.arcanum === 'psychic-shield') {
      requireTalent();
      await ctx.tx
        .update(a.arcaneEffects)
        .set({ active: false })
        .where(
          and(
            eq(a.arcaneEffects.characterId, actor.id),
            eq(a.arcaneEffects.arcanum, input.arcanum),
          ),
        );
      // The passive shield defaults to raised even without a row. A row records a voluntary choice.
      return effect(actor.id, { raised: input.raised }, false);
    }
    if (input.arcanum === 'body-control') {
      requireTalent(input.tradition.toLowerCase());
      if (input.tradition === 'MEDITATIVE' && input.targetId !== actor.id)
        throw new BadRequestException('Meditative Body Control is self only');
      await this.target(input, input.tradition, ctx);
      const ability =
        input.tradition === 'MEDITATIVE' ? 'WILLPOWER' : 'PERCEPTION';
      const roll = await check(
        ability,
        input.tradition === 'MEDITATIVE'
          ? 'willpower-meditative'
          : `perception-${input.tradition.toLowerCase()}`,
        bodyControlDifficulty(input.use),
      );
      return roll.success
        ? effect(input.targetId, { use: input.use, tradition: input.tradition })
        : failed();
    }
    if (input.arcanum === 'psychic-contact') {
      requireTalent(input.tradition.toLowerCase());
      await this.target(input, input.tradition, ctx);
      const shield = await this.shieldRaised(input.targetId, ctx);
      if (shield)
        throw new ConflictException(
          'Player choice required: target must lower Psychic Shield; shield contests are not automated',
        );
      const roll = await check(
        'COMMUNICATION',
        `communication-${input.tradition.toLowerCase()}`,
        7,
      );
      return roll.success
        ? effect(input.targetId, { twoWay: true, mindReading: false })
        : failed();
    }
    if (input.arcanum === 'second-sight') {
      requireTalent();
      let context: ArcaneContext | null = input.contextId
        ? await this.context(input.contextId, actor.id, ctx)
        : null;
      if (!input.contextId) {
        const traces = await ctx.tx
          .select()
          .from(a.arcaneContexts)
          .where(
            and(
              eq(a.arcaneContexts.campaignId, ctx.campaignId),
              eq(a.arcaneContexts.sessionId, ctx.sessionId),
              eq(a.arcaneContexts.characterId, actor.id),
            ),
          );
        const present = traces.filter(
          (r) => r.value.kind === 'TRACE' && r.preparedFor === ctx.sceneScope,
        );
        if (present.length > 1)
          throw new ConflictException(
            'Exceptional adjudication: multiple simultaneous traces require separate prepared senses',
          );
        context = present[0]?.value ?? null;
      }
      if (!context) {
        throw new ConflictException(
          'Exceptional adjudication: no canonical sensory context prepared',
        );
      }
      if (context.kind !== 'TRACE')
        throw new BadRequestException('Arcane trace context required');
      const tn =
        Math.max(11, context.shieldTotal) +
        Math.floor(context.distanceMeters / 3);
      const roll = await check(
        'PERCEPTION',
        focus('perception-psychic') >= focus('perception-visionary')
          ? 'perception-psychic'
          : 'perception-visionary',
        tn,
        true,
      );
      const caster = context.casterId
        ? await this.repository.character(
            ctx.campaignId,
            context.casterId,
            ctx.tx,
          )
        : null;
      const information = sightInformation(
        roll.total,
        tn,
        caster?.known ?? false,
      );
      const changes: Record<string, unknown> = { information };
      if (information !== 'NONE')
        Object.assign(changes, {
          discipline: context.discipline,
          distanceMeters: context.distanceMeters,
        });
      if (information === 'ARCANUM' || information === 'KNOWN_CASTER')
        changes.arcanum = context.arcanum;
      if (information === 'KNOWN_CASTER') changes.casterId = context.casterId;
      return {
        id: (
          await ctx.emit({
            type: 'ARCANA_PERCEIVED',
            description:
              information === 'NONE'
                ? 'Nenhuma manifestação percebida.'
                : `Manifestação percebida: ${context.discipline}.`,
            participants: [actor.id],
            changes,
          })
        ).id,
      };
    }
    const context = await this.context(input.contextId, actor.id, ctx);
    requireTalent('shaping');
    if (input.arcanum === 'move-object') {
      if (context.kind !== 'OBJECT')
        throw new BadRequestException(
          'Known unattended object context required',
        );
      const rule = moveObjectRule(context.massKg, input.fatigue);
      const roll = await check(
        'INTELLIGENCE',
        'intelligence-shaping',
        rule.targetNumber,
      );
      if (rule.fatigue)
        await this.fatigue(
          actor.id,
          stats,
          focus('willpower-self-discipline'),
          ctx,
        );
      const current = await this.data(actor.id, ctx);
      if (current.vitals.lifeState !== 'ALIVE') return failed();
      return roll.success
        ? effect(actor.id, {
            contextId: input.contextId,
            massKg: context.massKg,
            metersPerMinorAction: 1.5 + 1.5 * (roll.total - rule.targetNumber),
          })
        : failed();
    }
    if (context.kind !== 'WIND')
      throw new BadRequestException('Wind context required');
    if (context.radiusMeters > 12 * actor.level)
      throw new BadRequestException('Wind area exceeds caster level');
    const roll = await check('INTELLIGENCE', 'intelligence-shaping', 9);
    return roll.success
      ? effect(actor.id, {
          contextId: input.contextId,
          category: windChange(roll.total, context.category, input.category),
          originalCategory: context.category,
          radiusMeters: context.radiusMeters,
        })
      : failed();
  }
  private async context(
    id: string,
    characterId: string,
    ctx: GameContext,
  ): Promise<ArcaneContext> {
    const [row] = await ctx.tx
      .select()
      .from(a.arcaneContexts)
      .where(
        and(
          eq(a.arcaneContexts.id, id),
          eq(a.arcaneContexts.campaignId, ctx.campaignId),
          eq(a.arcaneContexts.sessionId, ctx.sessionId!),
          eq(a.arcaneContexts.characterId, characterId),
        ),
      );
    if (!row || row.preparedFor !== ctx.sceneScope)
      throw new NotFoundException(
        'Prepared arcane context not found in the current scene',
      );
    return arcaneContextSchema.parse(row.value);
  }
  private async target(
    input: Extract<ArcanaUse, { targetId: string }>,
    tradition: string,
    ctx: GameContext,
  ) {
    const target = await this.repository.character(
      ctx.campaignId,
      input.targetId,
      ctx.tx,
    );
    const data = await this.data(target.id, ctx);
    if (!data.vitals.living || data.vitals.lifeState === 'DEAD')
      throw new BadRequestException('Living target required');
    if (input.targetId === input.characterId && tradition !== 'ANIMISM') return;
    const rows = await ctx.tx
      .select()
      .from(a.arcaneContexts)
      .where(
        and(
          eq(a.arcaneContexts.campaignId, ctx.campaignId),
          eq(a.arcaneContexts.sessionId, ctx.sessionId!),
          eq(a.arcaneContexts.characterId, input.characterId),
        ),
      );
    const match = rows
      .filter((r) => r.preparedFor === ctx.sceneScope)
      .map((r) => arcaneContextSchema.parse(r.value))
      .find((v) => v.kind === 'CREATURE' && v.targetId === target.id);
    if (
      !match ||
      match.kind !== 'CREATURE' ||
      !match.willing ||
      (input.arcanum === 'body-control' && !match.touching)
    )
      throw new ConflictException(
        'Player choice or prepared willing target/touch context required',
      );
    if ((tradition === 'ANIMISM') !== (match.nature === 'ANIMAL'))
      throw new BadRequestException(
        'Tradition does not affect this target nature',
      );
  }
  private async shieldRaised(characterId: string, ctx: GameContext) {
    const [known] = await ctx.tx
      .select()
      .from(s.characterFeatures)
      .where(
        and(
          eq(s.characterFeatures.characterId, characterId),
          eq(s.characterFeatures.ruleId, 'psychic-shield'),
        ),
      );
    if (!known) return false;
    const [choice] = await ctx.tx
      .select()
      .from(a.arcaneEffects)
      .where(
        and(
          eq(a.arcaneEffects.characterId, characterId),
          eq(a.arcaneEffects.arcanum, 'psychic-shield'),
          eq(a.arcaneEffects.active, true),
        ),
      );
    return choice?.value.raised !== false;
  }
  private async fatigue(
    characterId: string,
    data: Awaited<ReturnType<BlueRoseArcanaExecutionService['data']>>,
    focus: number,
    ctx: GameContext,
  ) {
    const tn = 11 + data.vitals.castsSinceRest;
    const roll = this.dice.roll(
      data.abilities.WILLPOWER! + focus - data.vitals.fatigueLevel,
    );
    const result = resolveBasicCheck(roll, tn, false);
    await ctx.recordRoll(
      { ...roll, ...result },
      'PUBLIC',
      'Fadiga de Mover Objeto',
      characterId,
    );
    const fatigueLevel = Math.min(
      4,
      data.vitals.fatigueLevel + (result.success ? 0 : 1),
    );
    const unconsciousHours =
      fatigueLevel === 3 && data.health.current < data.health.maximum / 2
        ? this.dice.damageDice(1)[0]!
        : null;
    await ctx.tx
      .update(s.characterVitals)
      .set({
        fatigueLevel,
        castsSinceRest: data.vitals.castsSinceRest + 1,
        ...(unconsciousHours
          ? { lifeState: 'UNCONSCIOUS' as const, unconsciousHours }
          : {}),
        ...(fatigueLevel === 4 ? { lifeState: 'DYING' as const } : {}),
      })
      .where(eq(s.characterVitals.characterId, characterId));
    if (fatigueLevel === 4)
      await ctx.tx
        .update(s.characterResources)
        .set({ current: 0 })
        .where(
          and(
            eq(s.characterResources.characterId, characterId),
            eq(s.characterResources.name, 'HEALTH'),
          ),
        );
    await ctx.emit({
      type: 'ARCANA_FATIGUE_APPLIED',
      description: 'Fadiga arcana calculada pelo motor.',
      participants: [characterId],
      changes: { targetNumber: tn, success: result.success, fatigueLevel },
    });
    await this.endIfIncapacitated(characterId, ctx);
  }
  private async data(characterId: string, ctx: GameContext) {
    const [vitals] = await ctx.tx
      .select()
      .from(s.characterVitals)
      .where(eq(s.characterVitals.characterId, characterId));
    const [health] = await ctx.tx
      .select()
      .from(s.characterResources)
      .where(
        and(
          eq(s.characterResources.characterId, characterId),
          eq(s.characterResources.name, 'HEALTH'),
        ),
      );
    const scores = await ctx.tx
      .select()
      .from(s.characterAbilities)
      .where(eq(s.characterAbilities.characterId, characterId));
    if (
      !vitals ||
      !health ||
      abilities.some(
        (ability) => !scores.some((row) => row.ability === ability),
      )
    )
      throw new ConflictException('Incomplete character mechanics');
    return {
      vitals,
      health,
      abilities: Object.fromEntries(
        scores.map((row) => [row.ability, row.score]),
      ),
    };
  }
}
