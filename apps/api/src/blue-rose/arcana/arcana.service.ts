import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { campaignSessions } from '../../database/schema';
import { DatabaseService } from '../../database/database.service';
import * as s from '../../database/game-schema';
import type { GameContext } from '../../game-engine/context';
import type { EngineCommand } from '../../game-engine/commands';
import { GameRepository } from '../../database/game.repository';
import { BlueRoseDice } from '../mechanics/dice/blue-rose-dice';
import { resolveBasicCheck } from '../mechanics/tests/basic-check.rules';
import { BlueRoseCombatService } from '../mechanics/combat/combat.service';
import {
  recoverFatigue,
  recoveryConstitution,
  restMinutes,
} from '../mechanics/recovery/recovery.rules';
@Injectable()
export class BlueRoseArcanaService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: GameRepository,
    private readonly dice: BlueRoseDice,
    private readonly combat: BlueRoseCombatService,
  ) {}
  async apply(c: EngineCommand, ctx: GameContext): Promise<{ id: string }> {
    const { tx, campaignId, sessionId } = ctx;
    const encounter = await this.combat.active(campaignId, tx);
    if (encounter && c.type === 'REST')
      throw new ConflictException('Rest is supported in narrative time only');
    if (!sessionId) throw new ConflictException('Session required');
    if (c.type === 'REST') {
      const actor = await this.repository.character(
          campaignId,
          c.characterId,
          tx,
        ),
        data = await this.data(actor.id, ctx);
      if (
        (data.vitals.lifeState !== 'ALIVE' &&
          !(c.kind === 'SLEEP' && data.vitals.lifeState === 'UNCONSCIOUS')) ||
        data.health.current === 0 ||
        data.vitals.fatigueLevel === 4
      )
        throw new ConflictException('Dying or dead characters cannot rest');
      if (c.kind === 'LIGHT_REST' && !c.sustenanceConfirmed)
        throw new BadRequestException(
          'Four hours of light rest require food and drink',
        );
      const recovery =
        c.kind === 'SLEEP'
          ? 10 +
            recoveryConstitution(actor.people, data.scores.CONSTITUTION!) +
            actor.level
          : data.vitals.breatherAvailable
            ? 5 +
              recoveryConstitution(actor.people, data.scores.CONSTITUTION!) +
              actor.level
            : 0;
      const current = Math.min(
        data.health.maximum,
        data.health.current + Math.max(0, recovery),
      );
      const fatigueLevel = recoverFatigue(data.vitals.fatigueLevel, c.kind);
      await tx
        .update(s.characterResources)
        .set({ current })
        .where(
          and(
            eq(s.characterResources.characterId, actor.id),
            eq(s.characterResources.name, 'HEALTH'),
          ),
        );
      await tx
        .update(s.characterVitals)
        .set({
          fatigueLevel,
          castsSinceRest: 0,
          cureUsed: false,
          breatherAvailable: false,
          ...(c.kind === 'SLEEP'
            ? { lifeState: 'ALIVE' as const, unconsciousHours: null }
            : {}),
        })
        .where(eq(s.characterVitals.characterId, actor.id));
      await ctx.emit({
        type: 'REST_COMPLETED',
        description: c.reason,
        participants: [actor.id],
        changes: {
          kind: c.kind,
          minutes: restMinutes[c.kind],
          before: data.health.current,
          current,
          fatigueLevel,
        },
      });
      return { id: actor.id };
    }
    if (c.type === 'ARCANA_CURE_PREPARE') {
      const actor = await this.repository.character(
          campaignId,
          c.characterId,
          tx,
        ),
        target = await this.repository.character(campaignId, c.targetId, tx);
      await this.requireCure(actor.id, ctx);
      const [row] = await tx
        .insert(s.arcanaRequests)
        .values({
          campaignId,
          sessionId,
          characterId: actor.id,
          targetId: target.id,
          visibility: actor.known && target.known ? c.visibility : 'GM_ONLY',
        })
        .returning();
      if (!row) throw new Error('Missing arcanum request');
      await ctx.emit({
        type: 'ARCANA_REQUESTED',
        description: c.reason,
        participants: [actor.id, target.id],
        changes: { requestId: row.id, arcanum: 'cure', touchConfirmed: true },
        visibility: row.visibility,
      });
      return { id: row.id };
    }
    if (c.type !== 'ARCANA_CURE_RESOLVE')
      throw new BadRequestException('Unsupported arcanum command');
    const [request] = await tx
      .select()
      .from(s.arcanaRequests)
      .where(
        and(
          eq(s.arcanaRequests.id, c.requestId),
          eq(s.arcanaRequests.campaignId, campaignId),
        ),
      );
    if (
      !request ||
      (ctx.audience === 'PLAYER' && request.visibility === 'GM_ONLY')
    )
      throw new NotFoundException('Arcanum request not found');
    const actor = await this.repository.character(
      campaignId,
      request.characterId,
      tx,
    );
    if (ctx.audience === 'PLAYER' && actor.kind !== 'PROTAGONIST')
      throw new ForbiddenException('Only protagonist arcana can be resolved');
    if (request.resolved || request.sessionId !== sessionId)
      throw new ConflictException(
        'Arcanum request already resolved or in another session',
      );
    await this.requireCure(actor.id, ctx);
    const own = await this.data(actor.id, ctx),
      target = await this.data(request.targetId, ctx);
    if (
      own.vitals.lifeState !== 'ALIVE' ||
      own.health.current === 0 ||
      own.vitals.fatigueLevel >= 4
    )
      throw new ConflictException('Caster cannot act');
    if (!target.vitals.living || target.vitals.lifeState === 'DEAD')
      throw new ConflictException('Cure does not resurrect');
    if (target.vitals.cureUsed)
      throw new ConflictException(
        'Target must take a breather before benefiting from Cure again',
      );
    if (encounter) {
      const members = await tx
        .select()
        .from(s.combatMembers)
        .where(eq(s.combatMembers.encounterId, encounter.id));
      const caster = members.find((m) => m.characterId === actor.id),
        recipient = members.find((m) => m.characterId === request.targetId);
      if (
        !caster ||
        !recipient ||
        Math.hypot(caster.x - recipient.x, caster.y - recipient.y) > 2
      )
        throw new ConflictException(
          'Cure requires a target within touch range',
        );
      await this.combat.consumeAction(actor.id, 'MAJOR', ctx);
    }
    const focus = await this.focus(actor.id, 'intelligence-healing', ctx);
    const roll = this.dice.roll(
        own.scores.INTELLIGENCE! + focus - own.vitals.fatigueLevel,
      ),
      result = resolveBasicCheck(roll, 11, true);
    await ctx.recordRoll(
      { ...roll, ...result },
      request.visibility,
      'Arcano Curar',
      actor.id,
    );
    let casterHealth = own.health.current;
    if (result.success) {
      let current = Math.min(
        target.health.maximum,
        target.health.current +
          Math.max(
            0,
            roll.dramaDie + own.scores.INTELLIGENCE! + focus + actor.level,
          ),
      );
      let lifeState =
        target.vitals.lifeState === 'DYING' && current > 0
          ? ('ALIVE' as const)
          : target.vitals.lifeState;
      const stabilizedFatigue = target.vitals.fatigueLevel === 4 && current > 0;
      const unconsciousHours = stabilizedFatigue
        ? this.dice.damageDice(1)[0]!
        : target.vitals.unconsciousHours;
      if (stabilizedFatigue) lifeState = 'UNCONSCIOUS';
      if (
        lifeState === 'UNCONSCIOUS' &&
        target.vitals.fatigueLevel === 3 &&
        current > target.health.maximum / 2
      ) {
        lifeState = 'ALIVE';
        const targetActor = await this.repository.character(
          campaignId,
          request.targetId,
          tx,
        );
        current = Math.min(
          target.health.maximum,
          current +
            10 +
            recoveryConstitution(
              targetActor.people,
              target.scores.CONSTITUTION!,
            ) +
            targetActor.level,
        );
      }
      if (request.targetId === actor.id) casterHealth = current;
      await tx
        .update(s.characterResources)
        .set({ current })
        .where(
          and(
            eq(s.characterResources.characterId, request.targetId),
            eq(s.characterResources.name, 'HEALTH'),
          ),
        );
      await tx
        .update(s.characterVitals)
        .set({
          cureUsed: current > target.health.current,
          lifeState,
          ...(stabilizedFatigue ? { fatigueLevel: 3, unconsciousHours } : {}),
          ...(lifeState === 'ALIVE' ? { unconsciousHours: null } : {}),
        })
        .where(eq(s.characterVitals.characterId, request.targetId));
      await ctx.emit({
        type: 'ARCANA_HEALING_APPLIED',
        description: 'Curar — tradição de Cura',
        participants: [actor.id, request.targetId],
        changes: { arcanum: 'cure', before: target.health.current, current },
        visibility: request.visibility,
      });
    }
    const discipline = await this.focus(
        actor.id,
        'willpower-self-discipline',
        ctx,
      ),
      fatigueRoll = this.dice.roll(
        own.scores.WILLPOWER! + discipline - own.vitals.fatigueLevel,
      );
    const fatigueResult = resolveBasicCheck(
      fatigueRoll,
      11 + own.vitals.castsSinceRest,
      false,
    );
    await ctx.recordRoll(
      { ...fatigueRoll, ...fatigueResult },
      request.visibility,
      'Fadiga de Curar',
      actor.id,
    );
    const fatigueLevel = Math.min(
      4,
      own.vitals.fatigueLevel + (fatigueResult.success ? 0 : 1),
    );
    const unconsciousHours =
      fatigueLevel === 3 && casterHealth < own.health.maximum / 2
        ? this.dice.damageDice(1)[0]!
        : null;
    await tx
      .update(s.characterVitals)
      .set({
        unconsciousHours,
        ...(unconsciousHours ? { lifeState: 'UNCONSCIOUS' as const } : {}),
        fatigueLevel,
        castsSinceRest: own.vitals.castsSinceRest + 1,
        ...(fatigueLevel === 4 ? { lifeState: 'DYING' as const } : {}),
      })
      .where(eq(s.characterVitals.characterId, actor.id));
    if (fatigueLevel === 4)
      await tx
        .update(s.characterResources)
        .set({ current: 0 })
        .where(
          and(
            eq(s.characterResources.characterId, actor.id),
            eq(s.characterResources.name, 'HEALTH'),
          ),
        );
    await tx
      .update(s.arcanaRequests)
      .set({ resolved: true })
      .where(eq(s.arcanaRequests.id, request.id));
    await ctx.emit({
      type: 'ARCANA_RESOLVED',
      description: 'Curar resolvido com fadiga',
      participants: [actor.id, request.targetId],
      changes: {
        requestId: request.id,
        success: result.success,
        fatigueSuccess: fatigueResult.success,
        fatigueTargetNumber: 11 + own.vitals.castsSinceRest,
        fatigueLevel,
      },
      visibility: request.visibility,
    });
    return { id: request.id };
  }
  private async requireCure(characterId: string, ctx: GameContext) {
    const features = await ctx.tx
      .select()
      .from(s.characterFeatures)
      .where(eq(s.characterFeatures.characterId, characterId));
    if (
      !features.some((f) => f.ruleId === 'cure') ||
      !features.some((f) => f.ruleId === 'healing-talent')
    )
      throw new BadRequestException(
        'Known Cure and Healing talent are required; Meditative tradition is not automated',
      );
  }
  private async focus(characterId: string, id: string, ctx: GameContext) {
    const [row] = await ctx.tx
      .select()
      .from(s.characterFeatures)
      .where(
        and(
          eq(s.characterFeatures.characterId, characterId),
          eq(s.characterFeatures.ruleId, id),
        ),
      );
    return row ? (row.improved ? 3 : 2) : 0;
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
    if (!vitals || !health)
      throw new ConflictException('Incomplete character vitals');
    return {
      vitals,
      health,
      scores: Object.fromEntries(scores.map((a) => [a.ability, a.score])),
    };
  }
  async requests(campaignId: string) {
    return this.database.db
      .select({
        id: s.arcanaRequests.id,
        characterId: s.arcanaRequests.characterId,
        targetId: s.arcanaRequests.targetId,
      })
      .from(s.arcanaRequests)
      .innerJoin(
        s.characters,
        eq(s.characters.id, s.arcanaRequests.characterId),
      )
      .innerJoin(
        campaignSessions,
        eq(campaignSessions.id, s.arcanaRequests.sessionId),
      )
      .where(
        and(
          eq(campaignSessions.status, 'IN_PROGRESS'),
          eq(s.arcanaRequests.campaignId, campaignId),
          eq(s.arcanaRequests.resolved, false),
          eq(s.characters.kind, 'PROTAGONIST'),
          inVisible(s.arcanaRequests.visibility),
        ),
      );
  }
  async request(campaignId: string, id: string) {
    const [row] = await this.database.db
      .select()
      .from(s.arcanaRequests)
      .where(
        and(
          eq(s.arcanaRequests.campaignId, campaignId),
          eq(s.arcanaRequests.id, id),
        ),
      );
    if (!row || row.visibility === 'GM_ONLY')
      throw new NotFoundException('Arcanum request not found');
    return row;
  }
}
// Enum comparisons remain SQL predicates so secret request rows never reach player projections.
import { inArray } from 'drizzle-orm';
function inVisible(column: typeof s.arcanaRequests.visibility) {
  return inArray(column, ['PUBLIC', 'PLAYER_ONLY']);
}
