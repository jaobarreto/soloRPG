import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  DiceVisibility,
  type NarrativeProposal,
  type ScenePlan,
} from '@solo-rpg/shared-contracts';
import type { DatabaseTransaction } from '../database/database.service';
import * as g from '../database/game-schema';
import * as n from '../database/narrative-schema';
import { sessionMessages } from '../database/schema';
import { GameEngineService } from '../game-engine/game-engine.service';
import type { EngineCommand } from '../game-engine/commands';
import { NarrativeContextService } from './context.service';

type Action = typeof n.narrativeActions.$inferSelect;
export function stepId(actionId: string, step: string) {
  const hex = createHash('sha256').update(`${actionId}:${step}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
@Injectable()
export class NarrativeResolutionService {
  constructor(
    private readonly engine: GameEngineService,
    private readonly context: NarrativeContextService,
  ) {}
  private execute(
    action: Action,
    command: EngineCommand,
    step: string,
    tx: DatabaseTransaction,
  ) {
    return this.engine.executeNarrativeCommand(
      {
        campaignId: action.campaignId,
        sessionId: action.sessionId,
        commandId: stepId(action.id, step),
        command,
      },
      tx,
      action.id,
    );
  }
  async resolve(
    action: Action,
    proposal: NarrativeProposal,
    tx: DatabaseTransaction,
  ) {
    const [message] = await tx
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.id, action.playerMessageId));
    if (!message) throw new ConflictException('Missing input');
    if (
      ['THINK', 'OUT_OF_CHARACTER'].includes(message.interactionMode!) &&
      proposal.kind !== 'OBSERVE'
    )
      throw new BadRequestException('This mode cannot propose effects');
    const [prepared] = await tx
      .select()
      .from(n.sessionPlans)
      .where(eq(n.sessionPlans.sessionId, action.sessionId));
    if (proposal.kind === 'OBSERVE') {
      const narrative =
        message.interactionMode === 'OUT_OF_CHARACTER'
          ? 'Em Blue Rose AGE, um teste básico usa 3d6 + habilidade + foco aplicável contra a dificuldade definida pelo motor. O terceiro dado é o Drama Die. O backend solicita e resolve os testes; efeitos ainda sem regra implementada exigem adjudicação local. Pedidos fora do RPG não alteram os fatos da campanha.'
          : message.interactionMode === 'THINK'
            ? 'Seu pensamento permanece privado; ele não foi comunicado aos personagens presentes. O que deseja fazer ou dizer?'
            : `${prepared?.plan.opening ?? 'A cena aguarda sua próxima decisão.'}\n\nNenhuma consequência nova foi confirmada. Como deseja prosseguir?`;
      return this.commit(action, narrative, [], null, null, tx);
    }
    if (!prepared)
      throw new BadRequestException('Scene requires local preparation');
    const plan = prepared.plan;
    for (const id of plan.presentCharacterIds)
      await this.present(action, plan, id, tx);
    if (proposal.kind === 'ATTACK')
      return this.attack(action, plan, proposal, tx);
    const option = plan.options.find((o) => o.id === proposal.optionId);
    if (message.metadata?.selectedOptionId !== proposal.optionId)
      throw new BadRequestException(
        'A protagonist action must be explicitly selected by the player',
      );
    if (!option || option.mode !== message.interactionMode)
      throw new BadRequestException('Unavailable scene option');
    const normalized = message.content
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (
      !option.keywords.some((k) =>
        normalized.includes(
          k
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase(),
        ),
      )
    )
      throw new BadRequestException(
        'Player intent does not match prepared action',
      );
    const done = await this.context.completedOptions(
      action.campaignId,
      action.sessionId,
      tx,
    );
    if (
      done.includes(option.id) ||
      option.requiresOptionIds.some((id) => !done.includes(id))
    )
      throw new ConflictException('Scene prerequisite not met');
    const [pc] = await tx
      .select()
      .from(g.characters)
      .where(
        and(
          eq(g.characters.campaignId, action.campaignId),
          eq(g.characters.kind, 'PROTAGONIST'),
        ),
      );
    if (!pc) throw new ConflictException('Protagonist required');
    await this.present(action, plan, pc.id, tx);
    const [encounter] = await tx
      .select()
      .from(g.combatEncounters)
      .where(
        and(
          eq(g.combatEncounters.campaignId, action.campaignId),
          eq(g.combatEncounters.status, 'ACTIVE'),
        ),
      );
    if (encounter)
      throw new ConflictException(
        'Resolve the current encounter before scene actions',
      );
    let success = true;
    if (option.check) {
      let requestId = action.requestId;
      if (!requestId) {
        const result = await this.execute(
          action,
          {
            type: 'CHECK_PREPARE',
            characterId: pc.id,
            ability: option.check.ability,
            focusId: option.check.focusId ?? undefined,
            targetNumber: option.check.targetNumber,
            modifier: 0,
            reason: option.intent,
            visibility: option.check.secret
              ? DiceVisibility.GM_ONLY
              : DiceVisibility.PUBLIC,
            stuntsEligible: false,
          },
          'check-prepare',
          tx,
        );
        requestId = result.id;
        await tx
          .update(n.narrativeActions)
          .set({ requestId, optionId: option.id })
          .where(eq(n.narrativeActions.id, action.id));
        if (!option.check.secret) {
          await tx
            .update(n.narrativeActions)
            .set({
              status: 'AWAITING_ROLL',
              proposal,
              leaseToken: null,
              leaseUntil: null,
              error: null,
            })
            .where(eq(n.narrativeActions.id, action.id));
          return;
        }
        await this.execute(
          action,
          { type: 'CHECK_RESOLVE', requestId },
          'check-resolve',
          tx,
        );
      }
      const [roll] = await tx
        .select()
        .from(g.diceRolls)
        .where(eq(g.diceRolls.requestId, requestId));
      if (!roll || roll.success === null)
        throw new ConflictException('Official roll required');
      success = roll.success;
    }
    const eventIds: string[] = [];
    if (success) {
      for (const [i, effect] of option.effects.entries()) {
        if (effect.type === 'TRANSFER') {
          const owner = await this.present(action, plan, effect.fromId, tx);
          await this.present(action, plan, effect.toId, tx);
          if (owner.kind === 'PROTAGONIST' && option.mode !== 'ACT')
            throw new BadRequestException(
              'Voluntary inventory action requires ACT',
            );
          const [item] = await tx
            .select()
            .from(g.gameItems)
            .where(
              and(
                eq(g.gameItems.id, effect.itemId),
                eq(g.gameItems.campaignId, action.campaignId),
                inArray(g.gameItems.visibility, ['PUBLIC', 'PLAYER_ONLY']),
              ),
            );
          if (!item) throw new ConflictException('Item is unavailable');
          await this.execute(
            action,
            {
              type: 'INVENTORY_ACTION',
              characterId: owner.id,
              input: {
                action: 'TRANSFER',
                commandId: stepId(action.id, `effect-${i}`),
                sessionId: action.sessionId,
                itemId: effect.itemId,
                quantity: effect.quantity,
                toCharacterId: effect.toId,
              },
            },
            `effect-${i}`,
            tx,
          );
        } else if (effect.type === 'RELATIONSHIP') {
          const from = await this.present(action, plan, effect.fromId, tx);
          await this.present(action, plan, effect.toId, tx);
          if (from.kind === 'PROTAGONIST')
            throw new BadRequestException(
              'The master cannot set protagonist feelings',
            );
          const [relation] = await tx
            .select()
            .from(g.relationships)
            .where(
              and(
                eq(g.relationships.campaignId, action.campaignId),
                eq(g.relationships.fromCharacterId, effect.fromId),
                eq(g.relationships.toCharacterId, effect.toId),
                eq(g.relationships.metric, effect.metric),
              ),
            );
          if (!relation || relation.visibility === 'GM_ONLY')
            throw new ConflictException(
              'Prepared public relationship required',
            );
          await this.execute(
            action,
            {
              type: 'RELATIONSHIP_SET',
              fromCharacterId: effect.fromId,
              toCharacterId: effect.toId,
              metric: effect.metric,
              value: relation.value + effect.delta,
              reason: option.successText,
              visibility: DiceVisibility[relation.visibility],
            },
            `effect-${i}`,
            tx,
          );
        } else {
          const [entity] = await tx
            .select()
            .from(g.worldEntities)
            .where(
              and(
                eq(g.worldEntities.id, effect.entityId),
                eq(g.worldEntities.campaignId, action.campaignId),
              ),
            );
          if (
            !entity ||
            entity.visibility === 'GM_ONLY' ||
            entity.status !== effect.expectedStatus
          )
            throw new ConflictException('World prerequisite not met');
          await this.execute(
            action,
            {
              type: 'WORLD_UPSERT',
              entityId: entity.id,
              kind: entity.kind,
              name: entity.name,
              description: entity.description,
              status: effect.status,
              accessible: effect.accessible,
              privateNotes: entity.privateNotes,
              visibility: DiceVisibility[entity.visibility],
              reason: option.successText,
            },
            `effect-${i}`,
            tx,
          );
        }
      }
    }
    const text = success ? option.successText : option.failureText;
    const event = await this.execute(
      action,
      {
        type: 'EVENT_RECORD',
        eventType: 'CONSEQUENCE_RECORDED',
        description: text,
        participants: [pc.id, ...(success ? option.witnesses : [])],
        visibility: DiceVisibility.PUBLIC,
      },
      'scene-result',
      tx,
    );
    eventIds.push(event.id);
    if (success)
      for (const id of new Set([pc.id, ...option.witnesses])) {
        await this.present(action, plan, id, tx);
        await tx
          .insert(n.characterKnowledge)
          .values({
            campaignId: action.campaignId,
            characterId: id,
            eventId: event.id,
            source: option.mode === 'SPEAK' ? 'HEARD' : 'WITNESSED',
            importance: option.effects.some((e) => e.type === 'RELATIONSHIP')
              ? 90
              : 50,
          })
          .onConflictDoNothing();
      }
    return this.commit(action, text, eventIds, option.id, success, tx);
  }
  async roll(action: Action, tx: DatabaseTransaction) {
    if (
      action.status !== 'AWAITING_ROLL' ||
      !action.requestId ||
      !action.proposal
    )
      throw new ConflictException('No roll pending');
    await this.execute(
      action,
      { type: 'CHECK_RESOLVE', requestId: action.requestId },
      'check-resolve',
      tx,
    );
    return this.resolve(action, action.proposal, tx);
  }
  private async present(
    action: Action,
    plan: ScenePlan,
    id: string,
    tx: DatabaseTransaction,
  ) {
    const [row] = await tx
      .select({ character: g.characters, vitals: g.characterVitals })
      .from(g.characters)
      .innerJoin(
        g.characterVitals,
        eq(g.characterVitals.characterId, g.characters.id),
      )
      .where(
        and(
          eq(g.characters.id, id),
          eq(g.characters.campaignId, action.campaignId),
        ),
      );
    if (
      !row ||
      !row.character.known ||
      !plan.presentCharacterIds.includes(id) ||
      row.vitals.lifeState !== 'ALIVE' ||
      !row.vitals.living
    )
      throw new ConflictException('Character unavailable in this scene');
    return row.character;
  }
  private async attack(
    action: Action,
    plan: ScenePlan,
    proposal: Extract<NarrativeProposal, { kind: 'ATTACK' }>,
    tx: DatabaseTransaction,
  ) {
    const actor = await this.present(action, plan, proposal.actorId, tx);
    await this.present(action, plan, proposal.targetId, tx);
    if (actor.kind === 'PROTAGONIST')
      throw new BadRequestException(
        'The master cannot choose protagonist attacks',
      );
    const [encounter] = await tx
      .select()
      .from(g.combatEncounters)
      .where(
        and(
          eq(g.combatEncounters.campaignId, action.campaignId),
          eq(g.combatEncounters.sessionId, action.sessionId),
          eq(g.combatEncounters.status, 'ACTIVE'),
        ),
      );
    if (!encounter || encounter.visibility === 'GM_ONLY')
      throw new ConflictException('Approved public encounter required');
    await this.execute(
      action,
      {
        type: 'COMBAT_ACTION',
        input: {
          commandId: stepId(action.id, 'attack'),
          sessionId: action.sessionId,
          encounterId: encounter.id,
          characterId: actor.id,
          targetId: proposal.targetId,
          action: 'ATTACK',
        },
      },
      'attack',
      tx,
    );
    // Find the exact roll from this command, not an arbitrary previous attack.
    const [roll] = await tx
      .select()
      .from(g.diceRolls)
      .where(
        and(
          eq(g.diceRolls.campaignId, action.campaignId),
          eq(g.diceRolls.sessionId, action.sessionId),
        ),
      )
      .orderBy(desc(g.diceRolls.sequence))
      .limit(1);
    const [exact] = roll
      ? await tx
          .select()
          .from(g.combatAttacks)
          .where(eq(g.combatAttacks.rollId, roll.id))
      : [];
    if (!exact) throw new ConflictException('Missing attack receipt');
    if (!exact.resolved) {
      await tx
        .update(n.narrativeActions)
        .set({
          status: 'AWAITING_STUNTS',
          proposal,
          requestId: exact.id,
          leaseToken: null,
          leaseUntil: null,
          error: null,
        })
        .where(eq(n.narrativeActions.id, action.id));
      return;
    }
    return this.commitAttack(action, exact, tx);
  }
  async declineNpcStunts(action: Action, tx: DatabaseTransaction) {
    if (action.status !== 'AWAITING_STUNTS' || !action.requestId)
      throw new ConflictException('No Stunts pending');
    // Explicit endpoint: the local operator declines pending NPC Stunts; no fabricated choice.
    await this.execute(
      action,
      {
        type: 'COMBAT_RESOLVE',
        input: {
          commandId: stepId(action.id, 'stunts'),
          sessionId: action.sessionId,
          attackId: action.requestId,
          stunts: [],
        },
      },
      'stunts',
      tx,
    );
    const [attack] = await tx
      .select()
      .from(g.combatAttacks)
      .where(eq(g.combatAttacks.id, action.requestId));
    if (!attack?.resolved) throw new ConflictException('Attack not resolved');
    return this.commitAttack(action, attack, tx);
  }
  private async commitAttack(
    action: Action,
    attack: typeof g.combatAttacks.$inferSelect,
    tx: DatabaseTransaction,
  ) {
    const events = await tx
      .select({ id: g.gameEvents.id })
      .from(g.gameEvents)
      .where(
        and(
          eq(g.gameEvents.campaignId, action.campaignId),
          inArray(g.gameEvents.commandId, [
            stepId(action.id, 'attack'),
            stepId(action.id, 'stunts'),
          ]),
          inArray(g.gameEvents.visibility, ['PUBLIC', 'PLAYER_ONLY']),
        ),
      );
    const [roll] = await tx
      .select()
      .from(g.diceRolls)
      .where(eq(g.diceRolls.id, attack.rollId));
    for (const characterId of [attack.actorId, attack.targetId])
      for (const event of events)
        await tx
          .insert(n.characterKnowledge)
          .values({
            campaignId: action.campaignId,
            characterId,
            eventId: event.id,
            source: 'WITNESSED',
            importance: 90,
          })
          .onConflictDoNothing();
    const text = !roll?.success
      ? 'O ataque não atinge o alvo.'
      : attack.damage === 0
        ? 'O ataque acerta, mas a proteção impede qualquer perda de Vida.'
        : `O ataque acerta. O alvo perde ${attack.damage} pontos de Vida, conforme a resolução do motor.`;
    return this.commit(
      action,
      text,
      events.map((e) => e.id),
      null,
      null,
      tx,
    );
  }
  private async commit(
    action: Action,
    narrative: string,
    eventIds: string[],
    optionId: string | null,
    success: boolean | null,
    tx: DatabaseTransaction,
  ) {
    await tx
      .update(n.narrativeActions)
      .set({
        status: 'COMMITTED',
        confirmed: { narrative, eventIds },
        optionId,
        success,
        error: null,
      })
      .where(eq(n.narrativeActions.id, action.id));
  }
}
