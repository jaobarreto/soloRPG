import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { PublicCombat } from '@solo-rpg/shared-contracts';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service';
import * as s from '../database/game-schema';
import { GameRepository } from '../game-engine/game.repository';
import type { EngineCommand } from '../game-engine/commands';
import type { GameContext, Visibility } from '../game-engine/context';
import { BlueRoseDice, resolveBasicCheck } from './blue-rose.rules';
import {
  armorRules,
  combatStunts,
  damageAfterArmor,
  resolveOpposedCheck,
  shieldRules,
  validateCombatStunts,
  weaponRules,
  type CombatStunt,
} from './combat.rules';
type Member = typeof s.combatMembers.$inferSelect;
type Encounter = typeof s.combatEncounters.$inferSelect;
@Injectable()
export class BlueRoseCombatService {
  constructor(
    private readonly database: DatabaseService,
    private readonly repository: GameRepository,
    private readonly dice: BlueRoseDice,
  ) {}
  async apply(c: EngineCommand, ctx: GameContext): Promise<{ id: string }> {
    const { tx, campaignId, sessionId } = ctx;
    if (c.type === 'COMBAT_CONFIGURE') {
      await this.repository.character(campaignId, c.characterId, tx);
      if (await this.active(campaignId, tx))
        throw new ConflictException(
          'Combat configuration is locked during encounters',
        );
      const values = {
        armorType: c.armorType,
        armorTrained: c.armorTrained,
        shieldType: c.shieldType,
        shieldTrained: c.shieldTrained,
        baseSpeed: c.baseSpeed,
      };
      await tx
        .insert(s.combatProfiles)
        .values({ characterId: c.characterId, ...values })
        .onConflictDoUpdate({
          target: s.combatProfiles.characterId,
          set: values,
        });
      await tx
        .delete(s.weaponTraining)
        .where(eq(s.weaponTraining.characterId, c.characterId));
      await tx.insert(s.weaponTraining).values(
        [...new Set(c.weaponTraining)].map((ruleId) => ({
          characterId: c.characterId,
          ruleId,
        })),
      );
      await ctx.emit({
        type: 'COMBAT_PROFILE_RECORDED',
        description: c.reason,
        participants: [c.characterId],
        changes: values,
      });
      return { id: c.characterId };
    }
    if (!sessionId) throw new ConflictException('Combat requires a session');
    if (c.type === 'COMBAT_START') {
      if (await this.active(campaignId, tx))
        throw new ConflictException('An encounter is already active');
      if (
        new Set(c.members.map((m) => m.characterId)).size !== c.members.length
      )
        throw new BadRequestException('Duplicate combatant');
      let visibility: Visibility = c.visibility;
      const rolled = [];
      for (const input of c.members) {
        const actor = await this.repository.character(
          campaignId,
          input.characterId,
          tx,
        );
        if (!actor.known) visibility = 'GM_ONLY';
        if (actor.level > 2)
          throw new ConflictException(
            'Combat progression above level 2 is not automated',
          );
        const data = await this.stats(actor.id, tx);
        if (
          data.vitals.lifeState !== 'ALIVE' ||
          data.health.current === 0 ||
          data.vitals.fatigueLevel >= 3
        )
          throw new ConflictException('Combatant cannot act');
        const weapon = await this.weapon(actor.id, input.weaponItemId, tx);
        if (weapon.item.visibility === 'GM_ONLY') visibility = 'GM_ONLY';
        const focus = await this.focus(actor.id, 'dexterity-initiative', tx);
        const roll = this.dice.roll(
          data.abilities.DEXTERITY! +
            focus -
            data.vitals.fatigueLevel +
            (data.profile.armorTrained
              ? 0
              : armorRules[data.profile.armorType].penalty),
        );
        rolled.push({ input, actor, data, roll });
      }
      for (let a = 0; a < rolled.length; a++)
        for (let b = a + 1; b < rolled.length; b++)
          if (
            compareInitiative(
              rolled[a]!.roll,
              rolled[b]!.roll,
              rolled[a]!.data.abilities.DEXTERITY!,
              rolled[b]!.data.abilities.DEXTERITY!,
            ) === 0
          )
            throw new ConflictException(
              'Complete initiative tie requires Narrator adjudication; no tie order was invented',
            );
      // Raw total -> Drama Die -> Dexterity, exactly as the core rules.
      rolled.sort(
        (a, b) =>
          -compareInitiative(
            a.roll,
            b.roll,
            a.data.abilities.DEXTERITY!,
            b.data.abilities.DEXTERITY!,
          ),
      );
      const [encounter] = await tx
        .insert(s.combatEncounters)
        .values({ campaignId, sessionId, visibility })
        .returning();
      if (!encounter) throw new Error('Missing encounter');
      for (const [ordinal, entry] of rolled.entries()) {
        await ctx.recordRoll(
          { ...entry.roll, success: null, stuntPoints: 0 },
          visibility,
          'Iniciativa',
          entry.actor.id,
        );
        const [prone] = await tx
          .select()
          .from(s.characterConditions)
          .where(
            and(
              eq(s.characterConditions.characterId, entry.actor.id),
              eq(s.characterConditions.ruleKey, 'PRONE'),
            ),
          );
        await tx.insert(s.combatMembers).values({
          prone: !!prone,
          campaignId,
          encounterId: encounter.id,
          characterId: entry.actor.id,
          ordinal,
          initiative: entry.roll.total,
          initiativeDrama: entry.roll.dramaDie,
          weaponItemId: entry.input.weaponItemId,
          x: entry.input.x,
          y: entry.input.y,
          usesDyingRules:
            entry.actor.kind === 'PROTAGONIST' || entry.input.usesDyingRules,
        });
      }
      await ctx.emit({
        type: 'ENCOUNTER_STARTED',
        description: c.reason,
        participants: c.members.map((m) => m.characterId),
        changes: { encounterId: encounter.id, round: 1 },
        visibility,
      });
      return { id: encounter.id };
    }
    if (c.type === 'COMBAT_END') {
      const encounter = await this.encounter(campaignId, c.encounterId, tx);
      if (encounter.status !== 'ACTIVE' || encounter.sessionId !== sessionId)
        throw new ConflictException('Encounter is not active in session');
      const pending = await tx
        .select()
        .from(s.combatAttacks)
        .where(
          and(
            eq(s.combatAttacks.encounterId, encounter.id),
            eq(s.combatAttacks.resolved, false),
          ),
        );
      for (const attack of pending) await this.resolve(attack.id, [], ctx);
      const members = await this.members(encounter.id, tx);
      for (const member of members) {
        const stats = await this.stats(member.characterId, tx);
        if (stats.vitals.lifeState === 'DYING')
          throw new ConflictException(
            'Resolve dying characters before leaving supported action time',
          );
        await tx
          .update(s.characterVitals)
          .set({
            breatherAvailable:
              stats.health.current > 0 && stats.vitals.lifeState === 'ALIVE',
          })
          .where(eq(s.characterVitals.characterId, member.characterId));
      }
      await tx
        .update(s.combatEncounters)
        .set({ status: 'COMPLETED' })
        .where(eq(s.combatEncounters.id, encounter.id));
      await ctx.emit({
        type: 'ENCOUNTER_COMPLETED',
        description: c.reason,
        participants: members.map((m) => m.characterId),
        changes: { encounterId: encounter.id },
        visibility: encounter.visibility,
      });
      return { id: encounter.id };
    }
    if (c.type === 'COMBAT_RESOLVE')
      return this.resolve(c.input.attackId, c.input.stunts, ctx);
    if (c.type !== 'COMBAT_ACTION')
      throw new BadRequestException('Unsupported combat command');
    const input = c.input;
    if (input.sessionId !== sessionId)
      throw new BadRequestException('Wrong session');
    const encounter = await this.encounter(campaignId, input.encounterId, tx);
    await this.authorize(encounter, input.characterId, ctx);
    const members = await this.members(encounter.id, tx),
      actor = members[encounter.turnIndex]!;
    if (actor.characterId !== input.characterId)
      throw new ConflictException('Not this character turn');
    const pending = await tx
      .select()
      .from(s.combatAttacks)
      .where(
        and(
          eq(s.combatAttacks.encounterId, encounter.id),
          eq(s.combatAttacks.resolved, false),
        ),
      );
    if (pending.length) {
      if (input.action !== 'END_TURN')
        throw new ConflictException(
          'Resolve the attack and spend/decline Stunts immediately',
        );
      for (const attack of pending) await this.resolve(attack.id, [], ctx);
    }
    if (input.action === 'END_TURN') {
      await this.advance(encounter, members, ctx);
      return { id: encounter.id };
    }
    const data = await this.stats(actor.characterId, tx);
    if (data.vitals.lifeState !== 'ALIVE' || data.health.current === 0)
      throw new ConflictException('Character cannot act');
    const major = input.action === 'ATTACK' || input.action === 'DEFEND';
    if (
      major
        ? actor.majorUsed || actor.minorUsed > 1
        : actor.minorUsed >= (actor.majorUsed ? 1 : 2)
    )
      throw new ConflictException('No actions remaining');
    const patch: Partial<typeof s.combatMembers.$inferInsert> = {
      majorUsed: major ? true : actor.majorUsed,
      minorUsed: major ? actor.minorUsed : actor.minorUsed + 1,
      aimed: false,
    };
    if (input.action === 'ATTACK') {
      if (
        !input.targetId ||
        input.targetId === actor.characterId ||
        input.x !== undefined ||
        input.y !== undefined
      )
        throw new BadRequestException('Distinct target required');
      const target = members.find((m) => m.characterId === input.targetId);
      if (!target) throw new NotFoundException('Target not in encounter');
      const targetData = await this.stats(target.characterId, tx);
      if (
        targetData.vitals.lifeState === 'DEAD' ||
        targetData.health.current === 0
      )
        throw new ConflictException('Target is already incapacitated');
      const { rule } = await this.weapon(
        actor.characterId,
        actor.weaponItemId,
        tx,
      );
      const distance = Math.hypot(actor.x - target.x, actor.y - target.y);
      if (distance > rule.longRange)
        throw new ConflictException('Target outside weapon range');
      if (rule.reload && !actor.loaded)
        throw new ConflictException('Weapon must be reloaded');
      const focus = await this.focus(actor.characterId, rule.focusId, tx);
      const modifier =
        data.abilities[rule.ability]! +
        focus +
        (actor.aimed ? 1 : 0) +
        (distance > rule.range ? -2 : 0) +
        (target.prone && !rule.reload ? 1 : 0) -
        data.vitals.fatigueLevel;
      const roll = this.dice.roll(modifier),
        result = resolveBasicCheck(
          roll,
          this.defense(targetData, target),
          true,
        );
      const recorded = await ctx.recordRoll(
        { ...roll, ...result },
        encounter.visibility,
        'Ataque',
        actor.characterId,
      );
      const [attack] = await tx
        .insert(s.combatAttacks)
        .values({
          encounterId: encounter.id,
          actorId: actor.characterId,
          targetId: target.characterId,
          rollId: recorded.id,
          round: encounter.round,
          stuntPoints: result.stuntPoints,
          resolved: !result.success,
          rawDamage: result.success ? null : 0,
          armor: result.success ? null : 0,
          damage: result.success ? null : 0,
        })
        .returning();
      if (!attack) throw new Error('Missing attack');
      if (rule.reload) patch.loaded = false;
      await this.updateMember(actor, patch, tx);
      if (result.success && result.stuntPoints === 0)
        await this.resolve(attack.id, [], ctx);
      else
        await ctx.emit({
          type: result.success ? 'ATTACK_AWAITING_STUNTS' : 'ATTACK_MISSED',
          description: result.success
            ? 'Escolha imediata de façanhas'
            : 'Ataque falhou',
          participants: [actor.characterId, target.characterId],
          changes: {
            attackId: attack.id,
            availableStuntPoints: result.stuntPoints,
          },
          visibility: encounter.visibility,
        });
      return { id: encounter.id };
    }
    if (input.targetId)
      throw new BadRequestException('Action does not accept a target');
    if (
      input.action !== 'MOVE' &&
      (input.x !== undefined || input.y !== undefined)
    )
      throw new BadRequestException('Coordinates only accepted for MOVE');
    if (input.action === 'AIM') patch.aimed = true;
    if (input.action === 'DEFEND') patch.defenseBonus = 2;
    if (input.action === 'STAND') {
      if (!actor.prone) throw new ConflictException('Character is not prone');
      patch.prone = false;
      await tx
        .delete(s.characterConditions)
        .where(
          and(
            eq(s.characterConditions.characterId, actor.characterId),
            eq(s.characterConditions.ruleKey, 'PRONE'),
          ),
        );
    }
    if (input.action === 'RELOAD') {
      const { rule } = await this.weapon(
        actor.characterId,
        actor.weaponItemId,
        tx,
      );
      if (!rule.reload || actor.loaded)
        throw new ConflictException('Reload is not needed');
      patch.loaded = true;
    }
    if (input.action === 'MOVE') {
      if (actor.prone) throw new ConflictException('Stand up before moving');
      if (input.x === undefined || input.y === undefined)
        throw new BadRequestException('Coordinates required');
      const speed =
        Math.max(
          0,
          data.profile.baseSpeed +
            data.abilities.DEXTERITY! +
            armorRules[data.profile.armorType].penalty,
        ) * (data.vitals.fatigueLevel >= 2 ? 0.5 : 1);
      if (Math.hypot(input.x - actor.x, input.y - actor.y) > Math.floor(speed))
        throw new ConflictException('Movement exceeds Speed');
      patch.x = input.x;
      patch.y = input.y;
    }
    await this.updateMember(actor, patch, tx);
    await ctx.emit({
      type: 'COMBAT_ACTION',
      description: input.action,
      participants: [actor.characterId],
      changes: { encounterId: encounter.id, action: input.action, ...patch },
      visibility: encounter.visibility,
    });
    return { id: encounter.id };
  }
  private async resolve(
    id: string,
    stunts: CombatStunt[],
    ctx: GameContext,
  ): Promise<{ id: string }> {
    const { tx } = ctx;
    const [attack] = await tx
      .select()
      .from(s.combatAttacks)
      .where(eq(s.combatAttacks.id, id));
    if (!attack) throw new NotFoundException('Attack not found');
    const encounter = await this.encounter(
      ctx.campaignId,
      attack.encounterId,
      tx,
    );
    await this.authorize(encounter, attack.actorId, ctx);
    const members = await this.members(encounter.id, tx),
      actor = members.find((m) => m.characterId === attack.actorId)!,
      target = members.find((m) => m.characterId === attack.targetId)!;
    if (
      attack.resolved ||
      attack.round !== encounter.round ||
      members[encounter.turnIndex]?.characterId !== actor.characterId
    )
      throw new ConflictException('Stunt window has expired');
    const prior = await tx
      .select({ stunt: s.combatStuntUses.stuntId })
      .from(s.combatStuntUses)
      .innerJoin(
        s.combatAttacks,
        eq(s.combatAttacks.id, s.combatStuntUses.attackId),
      )
      .where(
        and(
          eq(s.combatAttacks.encounterId, encounter.id),
          eq(s.combatAttacks.actorId, actor.characterId),
          eq(s.combatAttacks.round, encounter.round),
        ),
      );
    const cost = validateCombatStunts(
      stunts,
      attack.stuntPoints,
      prior.map((p) => p.stunt as CombatStunt),
    );
    const own = await this.stats(actor.characterId, tx),
      enemy = await this.stats(target.characterId, tx),
      { rule } = await this.weapon(actor.characterId, actor.weaponItemId, tx);
    const damageDice = this.dice.damageDice(
      rule.dice + stunts.reduce((n, s) => n + combatStunts[s].damageDice, 0),
    );
    const rawDamage =
      damageDice.reduce((a, b) => a + b, 0) +
      rule.bonus +
      own.abilities[rule.damageAbility]!;
    const armor = armorRules[enemy.profile.armorType].rating;
    const damage = damageAfterArmor(
      rawDamage,
      armor,
      stunts.includes('PIERCE_ARMOR'),
    );
    const current = Math.max(0, enemy.health.current - damage);
    await tx
      .update(s.characterResources)
      .set({ current })
      .where(
        and(
          eq(s.characterResources.characterId, target.characterId),
          eq(s.characterResources.name, 'HEALTH'),
        ),
      );
    if (stunts.includes('KNOCK_PRONE')) {
      await this.updateMember(target, { prone: true }, tx);
      await tx
        .insert(s.characterConditions)
        .values({
          characterId: target.characterId,
          ruleKey: 'PRONE',
          name: 'Caído',
          description:
            'Blue Rose AGE: +1 para ataques corpo a corpo contra este alvo; Levantar usa uma ação menor.',
          visibility: encounter.visibility,
        })
        .onConflictDoNothing();
    }
    if (stunts.includes('DEFENSIVE_STANCE'))
      await this.updateMember(actor, { defenseBonus: 2 }, tx);
    if (current === 0) {
      const dying = target.usesDyingRules;
      await tx
        .update(s.characterVitals)
        .set({ lifeState: dying ? 'DYING' : 'DEAD' })
        .where(eq(s.characterVitals.characterId, target.characterId));
      if (dying)
        await this.updateMember(
          target,
          {
            dyingAtRound:
              encounter.round + Math.max(0, 2 + enemy.abilities.CONSTITUTION!),
          },
          tx,
        );
    }
    if (stunts.length)
      await tx.insert(s.combatStuntUses).values(
        stunts.map((stuntId) => ({
          attackId: id,
          stuntId,
          cost: combatStunts[stuntId].cost,
        })),
      );
    await tx
      .update(s.combatAttacks)
      .set({ resolved: true, rawDamage, armor, damage })
      .where(eq(s.combatAttacks.id, id));
    await ctx.emit({
      type: 'DAMAGE_APPLIED',
      description: 'Dano de ataque Blue Rose AGE',
      participants: [actor.characterId, target.characterId],
      changes: {
        encounterId: encounter.id,
        attackId: id,
        damageDice,
        rawDamage,
        armor,
        pierce: stunts.includes('PIERCE_ARMOR'),
        damage,
        before: enemy.health.current,
        current,
        lifeState:
          current === 0
            ? target.usesDyingRules
              ? 'DYING'
              : 'DEAD'
            : enemy.vitals.lifeState,
      },
      visibility: encounter.visibility,
    });
    if (stunts.length)
      await ctx.emit({
        type: 'STUNTS_APPLIED',
        description: 'Façanhas de combate aplicadas',
        participants: [actor.characterId, target.characterId],
        changes: {
          attackId: id,
          stunts,
          cost,
          discarded: attack.stuntPoints - cost,
        },
        visibility: encounter.visibility,
      });
    return { id: encounter.id };
  }
  private async advance(
    encounter: Encounter,
    members: Member[],
    ctx: GameContext,
  ) {
    let index = encounter.turnIndex,
      round = encounter.round;
    for (let n = 0; n < members.length; n++) {
      index++;
      if (index === members.length) {
        index = 0;
        round++;
      }
      const member = members[index]!,
        data = await this.stats(member.characterId, ctx.tx);
      if (
        member.dyingAtRound !== null &&
        round >= member.dyingAtRound &&
        data.vitals.lifeState === 'DYING'
      ) {
        await ctx.tx
          .update(s.characterVitals)
          .set({ lifeState: 'DEAD' })
          .where(eq(s.characterVitals.characterId, member.characterId));
        await ctx.emit({
          type: 'CHARACTER_DIED',
          description: 'Prazo de personagem morrendo encerrado',
          participants: [member.characterId],
          changes: { round },
          visibility: encounter.visibility,
        });
      } else if (data.vitals.lifeState === 'ALIVE' && data.health.current > 0)
        break;
    }
    await ctx.tx
      .update(s.combatEncounters)
      .set({ turnIndex: index, round })
      .where(eq(s.combatEncounters.id, encounter.id));
    await this.updateMember(
      members[index]!,
      { majorUsed: false, minorUsed: 0, aimed: false, defenseBonus: 0 },
      ctx.tx,
    );
    await ctx.emit({
      type: 'TURN_STARTED',
      description: 'Próximo turno',
      participants: [members[index]!.characterId],
      changes: { encounterId: encounter.id, round },
      visibility: encounter.visibility,
    });
  }
  private async authorize(
    encounter: Encounter,
    actorId: string,
    ctx: GameContext,
  ) {
    if (ctx.audience === 'PLAYER') {
      if (encounter.visibility === 'GM_ONLY')
        throw new NotFoundException('Encounter not found');
      const actor = await this.repository.character(
        ctx.campaignId,
        actorId,
        ctx.tx,
      );
      if (actor.kind !== 'PROTAGONIST')
        throw new ForbiddenException(
          'Only protagonist combat actions are controlled by the player',
        );
    }
    if (encounter.status !== 'ACTIVE' || encounter.sessionId !== ctx.sessionId)
      throw new ConflictException('Encounter not active in this session');
  }
  async active(
    campaignId: string,
    tx: DatabaseTransaction | DatabaseService['db'] = this.database.db,
  ) {
    return (
      await tx
        .select()
        .from(s.combatEncounters)
        .where(
          and(
            eq(s.combatEncounters.campaignId, campaignId),
            eq(s.combatEncounters.status, 'ACTIVE'),
          ),
        )
    )[0];
  }
  private async encounter(
    campaignId: string,
    id: string,
    tx: DatabaseTransaction,
  ) {
    const [row] = await tx
      .select()
      .from(s.combatEncounters)
      .where(
        and(
          eq(s.combatEncounters.id, id),
          eq(s.combatEncounters.campaignId, campaignId),
        ),
      );
    if (!row) throw new NotFoundException('Encounter not found');
    return row;
  }
  private members(id: string, tx: DatabaseTransaction) {
    return tx
      .select()
      .from(s.combatMembers)
      .where(eq(s.combatMembers.encounterId, id))
      .orderBy(s.combatMembers.ordinal);
  }
  private updateMember(
    member: Member,
    patch: Partial<typeof s.combatMembers.$inferInsert>,
    tx: DatabaseTransaction,
  ) {
    return tx
      .update(s.combatMembers)
      .set(patch)
      .where(
        and(
          eq(s.combatMembers.encounterId, member.encounterId),
          eq(s.combatMembers.characterId, member.characterId),
        ),
      );
  }
  async stats(characterId: string, tx: DatabaseTransaction) {
    const [profile] = await tx
      .select()
      .from(s.combatProfiles)
      .where(eq(s.combatProfiles.characterId, characterId));
    const [vitals] = await tx
      .select()
      .from(s.characterVitals)
      .where(eq(s.characterVitals.characterId, characterId));
    const [health] = await tx
      .select()
      .from(s.characterResources)
      .where(
        and(
          eq(s.characterResources.characterId, characterId),
          eq(s.characterResources.name, 'HEALTH'),
        ),
      );
    const [character] = await tx
      .select()
      .from(s.characters)
      .where(eq(s.characters.id, characterId));
    const scores = await tx
      .select()
      .from(s.characterAbilities)
      .where(eq(s.characterAbilities.characterId, characterId));
    if (!profile || !vitals || !health || !character)
      throw new ConflictException('Approved combat profile required');
    return {
      profile,
      vitals,
      health,
      character,
      abilities: Object.fromEntries(scores.map((a) => [a.ability, a.score])),
    };
  }
  private defense(
    data: Awaited<ReturnType<BlueRoseCombatService['stats']>>,
    member: Member,
  ) {
    return (
      10 +
      data.abilities.DEXTERITY! +
      (data.profile.shieldTrained
        ? shieldRules[data.profile.shieldType]
        : Math.min(1, shieldRules[data.profile.shieldType])) +
      member.defenseBonus +
      (data.character.characterClass === 'EXPERT' &&
      data.profile.armorType === 'NONE'
        ? 1
        : 0)
    );
  }
  private async focus(
    characterId: string,
    id: string,
    tx: DatabaseTransaction,
  ) {
    const [feature] = await tx
      .select()
      .from(s.characterFeatures)
      .where(
        and(
          eq(s.characterFeatures.characterId, characterId),
          eq(s.characterFeatures.ruleId, id),
        ),
      );
    return feature ? (feature.improved ? 3 : 2) : 0;
  }
  private async weapon(
    characterId: string,
    itemId: string,
    tx: DatabaseTransaction,
  ) {
    const [item] = await tx
      .select({ item: s.gameItems, entry: s.inventory })
      .from(s.inventory)
      .innerJoin(s.gameItems, eq(s.gameItems.id, s.inventory.itemId))
      .where(
        and(
          eq(s.inventory.characterId, characterId),
          eq(s.inventory.itemId, itemId),
        ),
      );
    if (
      !item ||
      !item.entry.equipped ||
      item.entry.quantity === 0 ||
      !item.item.equipmentRuleId
    )
      throw new ConflictException('An equipped supported weapon is required');
    const [trained] = await tx
      .select()
      .from(s.weaponTraining)
      .where(
        and(
          eq(s.weaponTraining.characterId, characterId),
          eq(s.weaponTraining.ruleId, item.item.equipmentRuleId),
        ),
      );
    if (!trained)
      throw new ConflictException('Untrained weapon attacks are not automated');
    return { item: item.item, rule: weaponRules[item.item.equipmentRuleId] };
  }
  async publicView(campaignId: string): Promise<PublicCombat | null> {
    return this.database.db.transaction(
      async (tx) => {
        const encounter = await this.active(campaignId, tx);
        if (!encounter || encounter.visibility === 'GM_ONLY') return null;
        const members = await this.members(encounter.id, tx),
          result = [];
        for (const m of members) {
          const data = await this.stats(m.characterId, tx);
          result.push({
            characterId: m.characterId,
            name: data.character.name,
            initiative: m.initiative,
            x: m.x,
            y: m.y,
            prone: m.prone,
            majorUsed: m.majorUsed,
            minorUsed: m.minorUsed,
            health: data.health.current,
            lifeState: data.vitals.lifeState,
          });
        }
        const pending = await tx
          .select()
          .from(s.combatAttacks)
          .where(
            and(
              eq(s.combatAttacks.encounterId, encounter.id),
              eq(s.combatAttacks.resolved, false),
            ),
          );
        return {
          id: encounter.id,
          sessionId: encounter.sessionId,
          status: encounter.status,
          round: encounter.round,
          turnCharacterId: members[encounter.turnIndex]!.characterId,
          members: result,
          pendingAttacks: pending.map((a) => ({
            id: a.id,
            actorId: a.actorId,
            targetId: a.targetId,
            stuntPoints: a.stuntPoints,
          })),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async availablePoints(rollId: string) {
    const [row] = await this.database.db
      .select({ points: s.combatAttacks.stuntPoints })
      .from(s.combatAttacks)
      .where(
        and(
          eq(s.combatAttacks.rollId, rollId),
          eq(s.combatAttacks.resolved, false),
        ),
      );
    return row?.points ?? 0;
  }
}
function compareInitiative(
  a: Parameters<typeof resolveOpposedCheck>[0],
  b: Parameters<typeof resolveOpposedCheck>[0],
  aAbility: number,
  bAbility: number,
) {
  const outcome = resolveOpposedCheck(a, aAbility, b, bAbility);
  return outcome === 'LEFT' ? 1 : outcome === 'RIGHT' ? -1 : 0;
}
