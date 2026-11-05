import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import type { abilities, PublicCheckRequest } from '@solo-rpg/shared-contracts';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../../../database/database.service';
import { campaignSessions } from '../../../database/schema';
import * as s from '../../../database/game-schema';
import { GameRepository } from '../../../database/game.repository';
import type { EngineCommand } from '../../../game-engine/commands';
import type { GameContext } from '../../../game-engine/context';
import { BlueRoseDice } from '../dice/blue-rose-dice';
import { resolveBasicCheck } from './basic-check.rules';
import { resolveOpposedCheck } from '../combat/combat.rules';
@Injectable()
export class BlueRoseTestsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: GameRepository,
    private readonly dice: BlueRoseDice,
  ) {}
  async apply(c: EngineCommand, ctx: GameContext): Promise<{ id: string }> {
    if (
      c.type === 'CHECK_PREPARE' ||
      c.type === 'CHECK_RESOLVE' ||
      c.type === 'ROLL'
    )
      return this.basic(c, ctx);
    const { tx, campaignId, sessionId } = ctx;
    if (c.type === 'ADVANCED_CREATE') {
      const actor = await this.repository.character(
        campaignId,
        c.characterId,
        tx,
      );
      if (c.focusId) await this.score(actor.id, c.ability, c.focusId, ctx);
      const [task] = await tx
        .insert(s.advancedTests)
        .values({
          campaignId,
          characterId: actor.id,
          ability: c.ability,
          focusId: c.focusId,
          targetNumber: c.targetNumber,
          threshold: c.threshold,
          intervalMinutes: c.intervalMinutes,
          reason: c.reason,
          visibility: actor.known ? c.visibility : 'GM_ONLY',
        })
        .returning();
      if (!task) throw new Error('Missing advanced test');
      await ctx.emit({
        type: 'ADVANCED_TEST_CREATED',
        description: c.reason,
        participants: [actor.id],
        changes: { advancedTestId: task.id, threshold: c.threshold },
        visibility: task.visibility,
      });
      return { id: task.id };
    }
    if (!sessionId) throw new ConflictException('Session required');
    if (c.type === 'OPPOSED_PREPARE') {
      const actor = await this.repository.character(
          campaignId,
          c.characterId,
          tx,
        ),
        opponent = await this.repository.character(
          campaignId,
          c.opponentId,
          tx,
        );
      if (actor.id === opponent.id)
        throw new BadRequestException('Distinct opponent required');
      await this.score(actor.id, c.ability, c.focusId, ctx);
      await this.score(opponent.id, c.opponentAbility, c.opponentFocusId, ctx);
      const [row] = await tx
        .insert(s.specialCheckRequests)
        .values({
          campaignId,
          sessionId,
          kind: 'OPPOSED',
          characterId: actor.id,
          ability: c.ability,
          focusId: c.focusId,
          modifier: c.modifier,
          opponentId: opponent.id,
          opponentAbility: c.opponentAbility,
          opponentFocusId: c.opponentFocusId,
          opponentModifier: c.opponentModifier,
          reason: c.reason,
          visibility: actor.known && opponent.known ? c.visibility : 'GM_ONLY',
          stuntsEligible: c.stuntsEligible,
        })
        .returning();
      if (!row) throw new Error('Missing opposed request');
      await ctx.emit({
        type: 'CHECK_REQUESTED',
        description: c.reason,
        participants: [actor.id, opponent.id],
        changes: { requestId: row.id, kind: 'OPPOSED' },
        visibility: row.visibility,
      });
      return { id: row.id };
    }
    if (c.type === 'ADVANCED_PREPARE') {
      const [task] = await tx
        .select()
        .from(s.advancedTests)
        .where(
          and(
            eq(s.advancedTests.id, c.advancedTestId),
            eq(s.advancedTests.campaignId, campaignId),
          ),
        );
      if (!task) throw new NotFoundException('Advanced test not found');
      if (task.progress >= task.threshold)
        throw new ConflictException('Advanced test completed');
      const [row] = await tx
        .insert(s.specialCheckRequests)
        .values({
          campaignId,
          sessionId,
          kind: 'ADVANCED',
          characterId: task.characterId,
          ability: task.ability,
          focusId: task.focusId,
          advancedTestId: task.id,
          reason: task.reason,
          visibility: task.visibility,
          stuntsEligible: c.stuntsEligible,
        })
        .returning();
      if (!row) throw new Error('Missing advanced request');
      await ctx.emit({
        type: 'CHECK_REQUESTED',
        description: task.reason,
        participants: [task.characterId],
        changes: { requestId: row.id, kind: 'ADVANCED' },
        visibility: row.visibility,
      });
      return { id: row.id };
    }
    if (c.type !== 'SPECIAL_CHECK_RESOLVE')
      throw new BadRequestException('Unsupported test command');
    const [check] = await tx
      .select()
      .from(s.specialCheckRequests)
      .where(
        and(
          eq(s.specialCheckRequests.id, c.requestId),
          eq(s.specialCheckRequests.campaignId, campaignId),
        ),
      );
    if (!check || (ctx.audience === 'PLAYER' && check.visibility === 'GM_ONLY'))
      throw new NotFoundException('Check request not found');
    const actor = await this.repository.character(
      campaignId,
      check.characterId,
      tx,
    );
    if (ctx.audience === 'PLAYER' && actor.kind !== 'PROTAGONIST')
      throw new ForbiddenException();
    if (check.resolved || check.sessionId !== sessionId)
      throw new ConflictException('Check window expired');
    const left = await this.score(
        actor.id,
        check.ability,
        check.focusId ?? undefined,
        ctx,
      ),
      roll = this.dice.roll(left.modifier + check.modifier);
    let result: { success: boolean | null; stuntPoints: number };
    if (check.kind === 'OPPOSED') {
      const right = await this.score(
          check.opponentId!,
          check.opponentAbility!,
          check.opponentFocusId ?? undefined,
          ctx,
        ),
        other = this.dice.roll(right.modifier + check.opponentModifier);
      const winner = resolveOpposedCheck(
        roll,
        left.ability,
        other,
        right.ability,
      );
      result = {
        success: winner === 'TIE' ? null : winner === 'LEFT',
        stuntPoints:
          winner === 'LEFT' &&
          check.stuntsEligible &&
          new Set(roll.dice).size < 3
            ? roll.dramaDie
            : 0,
      };
      await ctx.recordRoll(
        {
          ...other,
          success: winner === 'TIE' ? null : winner === 'RIGHT',
          stuntPoints: 0,
        },
        check.visibility,
        'Oposição: ' + check.reason,
        check.opponentId!,
      );
      await ctx.emit({
        type: 'OPPOSED_CHECK',
        description: check.reason,
        participants: [actor.id, check.opponentId!],
        changes: { winner },
        visibility: check.visibility,
      });
    } else {
      const [task] = await tx
        .select()
        .from(s.advancedTests)
        .where(eq(s.advancedTests.id, check.advancedTestId!));
      if (!task || task.progress >= task.threshold)
        throw new ConflictException('Advanced test completed');
      result = resolveBasicCheck(roll, task.targetNumber, check.stuntsEligible);
      const progress = task.progress + (result.success ? roll.dramaDie : 0);
      await tx
        .update(s.advancedTests)
        .set({ progress, attempts: task.attempts + 1 })
        .where(eq(s.advancedTests.id, task.id));
      await ctx.emit({
        type: 'ADVANCED_TEST_PROGRESS',
        description: task.reason,
        participants: [actor.id],
        changes: {
          advancedTestId: task.id,
          progress,
          attempts: task.attempts + 1,
          elapsedMinutes: (task.attempts + 1) * task.intervalMinutes,
          completed: progress >= task.threshold,
        },
        visibility: task.visibility,
      });
    }
    const receipt = await ctx.recordRoll(
      { ...roll, ...result },
      check.visibility,
      check.reason,
      actor.id,
    );
    await tx
      .update(s.specialCheckRequests)
      .set({ resolved: true })
      .where(eq(s.specialCheckRequests.id, check.id));
    return receipt;
  }
  private async basic(
    c: Extract<
      EngineCommand,
      { type: 'CHECK_PREPARE' | 'CHECK_RESOLVE' | 'ROLL' }
    >,
    ctx: GameContext,
  ) {
    const { tx, campaignId, sessionId, audience } = ctx;
    const character = (id: string) =>
      this.repository.character(campaignId, id, tx);
    switch (c.type) {
      case 'CHECK_PREPARE': {
        const actor = await character(c.characterId);
        if (c.focusId)
          await this.focusBonus(c.characterId, c.ability, c.focusId, tx);
        const [row] = await tx
          .insert(s.checkRequests)
          .values({
            campaignId,
            sessionId: sessionId!,
            characterId: c.characterId,
            ability: c.ability,
            focusId: c.focusId,
            targetNumber: c.targetNumber,
            modifier: c.modifier,
            reason: c.reason,
            visibility: actor.known ? c.visibility : 'GM_ONLY',
            stuntsEligible: c.stuntsEligible,
          })
          .returning();
        if (!row) throw new Error('Missing check request');
        await ctx.emit({
          type: 'CHECK_REQUESTED',
          description: c.reason,
          participants: [actor.id],
          changes: { requestId: row.id },
          visibility: row.visibility,
        });
        return { id: row.id };
      }
      case 'CHECK_RESOLVE': {
        const check = await this.repository.check(campaignId, c.requestId, tx);
        if (audience === 'PLAYER' && check.visibility === 'GM_ONLY')
          throw new NotFoundException('Check request not found');
        if (
          c.declaredDice &&
          (check.visibility === 'GM_ONLY' || audience !== 'INTERNAL')
        )
          throw new ForbiddenException(
            'A rolagem declarada exige um teste visível e autorizado.',
          );
        const actor = await character(check.characterId);
        if (audience === 'PLAYER' && actor.kind !== 'PROTAGONIST')
          throw new ForbiddenException(
            'Only protagonist checks can be resolved by the player',
          );
        if (check.sessionId !== sessionId || check.resolved)
          throw new ConflictException(
            'Check already resolved or belongs to another session',
          );
        const [ability] = await tx
          .select()
          .from(s.characterAbilities)
          .where(
            and(
              eq(s.characterAbilities.characterId, actor.id),
              eq(s.characterAbilities.ability, check.ability),
            ),
          );
        if (!ability) throw new ConflictException('Missing ability');
        const bonus = check.focusId
          ? await this.focusBonus(actor.id, check.ability, check.focusId, tx)
          : 0;
        const roll = this.dice.roll(
          ability.score +
            bonus +
            check.modifier -
            (
              await tx
                .select()
                .from(s.characterVitals)
                .where(eq(s.characterVitals.characterId, actor.id))
            )[0]!.fatigueLevel,
          c.declaredDice,
        );
        const result = resolveBasicCheck(
          roll,
          check.targetNumber,
          check.stuntsEligible,
        );
        await tx
          .update(s.checkRequests)
          .set({ resolved: true })
          .where(eq(s.checkRequests.id, check.id));
        return ctx.recordRoll(
          { ...roll, ...result },
          check.visibility,
          check.reason,
          actor.id,
          check.id,
        );
      }
      case 'ROLL':
        return ctx.recordRoll(
          { ...this.dice.roll(), success: null, stuntPoints: 0 },
          'PUBLIC',
          'Rolagem livre de 3d6',
        );
    }
  }
  private async focusBonus(
    characterId: string,
    ability: (typeof abilities)[number],
    focusId: string,
    tx: DatabaseTransaction,
  ) {
    const [focus] = await tx
      .select({ rule: s.ruleReferences, feature: s.characterFeatures })
      .from(s.characterFeatures)
      .innerJoin(
        s.ruleReferences,
        eq(s.characterFeatures.ruleId, s.ruleReferences.id),
      )
      .where(
        and(
          eq(s.characterFeatures.characterId, characterId),
          eq(s.characterFeatures.ruleId, focusId),
        ),
      );
    if (
      !focus ||
      focus.rule.kind !== 'FOCUS' ||
      focus.rule.status !== 'IMPLEMENTED' ||
      focus.rule.ability !== ability
    )
      throw new BadRequestException('Applicable known focus required');
    return focus.feature.improved ? 3 : 2;
  }
  private async score(
    characterId: string,
    ability: (typeof s.characterAbilities.$inferSelect)['ability'],
    focusId: string | undefined,
    ctx: GameContext,
  ) {
    const [score] = await ctx.tx
      .select()
      .from(s.characterAbilities)
      .where(
        and(
          eq(s.characterAbilities.characterId, characterId),
          eq(s.characterAbilities.ability, ability),
        ),
      );
    const [vital] = await ctx.tx
      .select()
      .from(s.characterVitals)
      .where(eq(s.characterVitals.characterId, characterId));
    if (!score || !vital) throw new ConflictException('Missing sheet');
    let bonus = 0;
    if (focusId) {
      const [feature] = await ctx.tx
        .select({ feature: s.characterFeatures, rule: s.ruleReferences })
        .from(s.characterFeatures)
        .innerJoin(
          s.ruleReferences,
          eq(s.ruleReferences.id, s.characterFeatures.ruleId),
        )
        .where(
          and(
            eq(s.characterFeatures.characterId, characterId),
            eq(s.characterFeatures.ruleId, focusId),
          ),
        );
      if (
        !feature ||
        feature.rule.kind !== 'FOCUS' ||
        feature.rule.ability !== ability
      )
        throw new BadRequestException('Applicable known focus required');
      bonus = feature.feature.improved ? 3 : 2;
    }
    return {
      ability: score.score,
      modifier: score.score + bonus - vital.fatigueLevel,
    };
  }
  async lookup(campaignId: string, id: string) {
    return (
      await this.database.db
        .select()
        .from(s.specialCheckRequests)
        .where(
          and(
            eq(s.specialCheckRequests.campaignId, campaignId),
            eq(s.specialCheckRequests.id, id),
          ),
        )
    )[0];
  }
  async requests(campaignId: string): Promise<PublicCheckRequest[]> {
    return this.database.db
      .select({
        id: s.specialCheckRequests.id,
        characterId: s.specialCheckRequests.characterId,
        ability: s.specialCheckRequests.ability,
        focusId: s.specialCheckRequests.focusId,
        reason: s.specialCheckRequests.reason,
      })
      .from(s.specialCheckRequests)
      .innerJoin(
        s.characters,
        eq(s.characters.id, s.specialCheckRequests.characterId),
      )
      .innerJoin(
        campaignSessions,
        eq(campaignSessions.id, s.specialCheckRequests.sessionId),
      )
      .where(
        and(
          eq(s.specialCheckRequests.campaignId, campaignId),
          eq(s.specialCheckRequests.resolved, false),
          eq(s.characters.kind, 'PROTAGONIST'),
          eq(campaignSessions.status, 'IN_PROGRESS'),
          inArray(s.specialCheckRequests.visibility, ['PUBLIC', 'PLAYER_ONLY']),
        ),
      );
  }
  async tasks(campaignId: string) {
    return this.database.db
      .select({
        id: s.advancedTests.id,
        characterId: s.advancedTests.characterId,
        reason: s.advancedTests.reason,
        progress: s.advancedTests.progress,
        threshold: s.advancedTests.threshold,
        attempts: s.advancedTests.attempts,
        intervalMinutes: s.advancedTests.intervalMinutes,
      })
      .from(s.advancedTests)
      .where(
        and(
          eq(s.advancedTests.campaignId, campaignId),
          inArray(s.advancedTests.visibility, ['PUBLIC', 'PLAYER_ONLY']),
        ),
      );
  }
}
