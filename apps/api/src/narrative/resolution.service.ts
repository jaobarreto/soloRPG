import {
  objectExaminationEvent,
  objectIntent,
  pinnedSceneObjects,
  resolveSceneObject,
} from '../adventures/core/objects/scene-objects';
import { declaredDice } from './queued-interaction';
import { confirmGuidedRoute } from '../adventures/core/director/guided-route';
import { adventureEntityId } from '../adventures/core/state/identity';
import {
  adventureContext,
  rememberAdventureEvent,
} from '../adventures/core/scenes/scene-state';
import { navigate } from '../adventures/core/navigation/navigate';
import { storedMentions, validateMentions } from './mentions';
import { AdventureRegistry } from '../adventures/core/registry/registry';
import { isDeepStrictEqual } from 'node:util';
import { stepId } from './identifiers';
export { stepId } from './identifiers';
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
  type MechanicalAction,
  mechanicalActionSchema,
  type FreeAction,
  type Narration,
} from '@solo-rpg/shared-contracts';
import type { DatabaseTransaction } from '../database/database.service';
import * as g from '../database/game-schema';
import * as n from '../database/narrative-schema';
import { sessionMessages } from '../database/schema';
import { GameEngineService } from '../game-engine/game-engine.service';
import type { EngineCommand } from '../game-engine/commands';
import { NarrativeContextService } from './context.service';
import { prepareAdventureScene } from '../adventures/core/scenes/execution';
import { loadAdventure } from '../adventures/core/state/state';
import { interpretFreeAction } from './free-action';
import * as a from '../database/arcana-schema';
import { createHash } from 'node:crypto';

type Action = typeof n.narrativeActions.$inferSelect;
@Injectable()
export class NarrativeResolutionService {
  constructor(
    private readonly engine: GameEngineService,
    private readonly context: NarrativeContextService,
    private readonly adventures: AdventureRegistry,
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
  async resolveObject(
    action: Action,
    message: typeof sessionMessages.$inferSelect,
    tx: DatabaseTransaction,
  ) {
    const intent = objectIntent(message.interactionMode, message.content);
    if (!intent) return false;
    const catalog = await pinnedSceneObjects(
      action.campaignId,
      tx,
      this.adventures,
    );
    if (!catalog) return false;
    const result = await resolveSceneObject(
      action.campaignId,
      action.sessionId,
      intent,
      tx,
      catalog,
    );
    const examination = result.examination;
    const eventIds: string[] = [];
    if (examination?.protagonistId) {
      const actorId = examination.protagonistId;
      const event = await this.engine.executeNarrativeCommand(
        {
          campaignId: action.campaignId,
          sessionId: action.sessionId,
          commandId: examination.commandId,
          command: {
            type: 'EVENT_RECORD',
            eventType: objectExaminationEvent,
            objectEvidence: {
              objectId: examination.id,
              revision: examination.revision,
            },
            description: result.text,
            visibility: DiceVisibility.PLAYER_ONLY,
            participants: [actorId],
          },
        },
        tx,
        action.id,
      );
      eventIds.push(event.id);
      await tx
        .insert(n.characterKnowledge)
        .values({
          campaignId: action.campaignId,
          characterId: actorId,
          eventId: event.id,
          source: 'WITNESSED',
        })
        .onConflictDoNothing();
    }
    await tx
      .update(sessionMessages)
      .set({
        metadata: { ...message.metadata, objectResolution: true },
      })
      .where(eq(sessionMessages.id, message.id));
    await this.commit(action, result.text, eventIds, null, null, tx);
    return true;
  }

  async resolveNavigation(
    action: Action,
    message: typeof sessionMessages.$inferSelect,
    tx: DatabaseTransaction,
  ) {
    if (message.interactionMode !== 'ACT' || message.metadata?.selectedMechanic)
      return false;
    const loaded = await loadAdventure(action.campaignId, tx);
    if (!loaded?.definition.spatial) return false;
    const module = this.adventures.forDefinition(loaded.definition);
    if (!module.navigation) return false;
    const result = await navigate(
      loaded,
      action.sessionId,
      action.id,
      {
        mode: message.interactionMode,
        text: message.content,
        selected: message.metadata?.selectedOptionId,
      },
      tx,
      module.navigation,
      module.scenePolicy,
    );
    if (!result) return false;
    await tx
      .update(sessionMessages)
      .set({
        metadata: {
          ...message.metadata,
          freeResolution: { category: 'OBSERVE' },
        },
      })
      .where(eq(sessionMessages.id, message.id));
    await this.commit(action, result.text, result.eventIds, null, null, tx);
    return true;
  }
  async resolve(
    action: Action,
    proposal: NarrativeProposal,
    tx: DatabaseTransaction,
  ): Promise<void> {
    const [message] = await tx
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.id, action.playerMessageId));
    if (!message) throw new ConflictException('Missing input');
    if (
      ['THINK', 'OUT_OF_CHARACTER', 'ROLL_RESULT'].includes(
        message.interactionMode!,
      ) &&
      !['OBSERVE', 'FREE'].includes(proposal.kind)
    )
      throw new BadRequestException('This mode cannot propose effects');
    const [prepared] = await tx
      .select()
      .from(n.sessionPlans)
      .where(eq(n.sessionPlans.sessionId, action.sessionId));
    if (
      storedMentions(message.metadata).length &&
      !['THINK', 'ROLL_RESULT', 'REQUEST_CHECK'].includes(
        message.interactionMode!,
      ) &&
      !(
        message.interactionMode === 'OUT_OF_CHARACTER' &&
        proposal.kind === 'OBSERVE'
      ) &&
      proposal.kind !== 'FREE' &&
      !(
        proposal.kind === 'SCENE' &&
        message.metadata?.resolvedOptionId === proposal.optionId
      ) &&
      !(
        proposal.kind === 'MECHANIC' &&
        isDeepStrictEqual(message.metadata?.resolvedMechanic, proposal.command)
      )
    )
      throw new ConflictException(
        'Explicit mentions require free-action interpretation',
      );
    if (
      message.interactionMode === 'REQUEST_CHECK' &&
      !['SCENE', 'OBSERVE'].includes(proposal.kind)
    )
      throw new BadRequestException(
        'O pedido de teste exige uma capacidade preparada.',
      );
    if (
      message.interactionMode === 'THINK' ||
      message.interactionMode === 'ROLL_RESULT'
    )
      proposal = { kind: 'OBSERVE' };
    if (proposal.kind === 'FREE') return this.free(action, proposal, tx);
    if (proposal.kind === 'OBSERVE') {
      if (
        message.interactionMode === 'ROLL_RESULT' &&
        message.metadata?.queued === true &&
        (await this.resolveStandaloneDeclaration(action, message.content, tx))
      )
        return;

      const { context: imported } = await adventureContext(
        action.campaignId,
        action.sessionId,
        tx,
        this.adventures,
      );
      const narrative =
        message.interactionMode === 'REQUEST_CHECK'
          ? 'Qual ação e alvo você quer testar? Nenhum teste aplicável foi confirmado para este pedido.'
          : message.interactionMode === 'ROLL_RESULT'
            ? 'Resultado anotado como declaração. Qual teste você queria resolver? Nenhum teste básico pendente foi associado.'
            : message.interactionMode === 'OUT_OF_CHARACTER'
              ? 'Em Blue Rose AGE, um teste básico usa 3d6 + habilidade + foco aplicável contra a dificuldade definida pelo motor. O terceiro dado é o Drama Die. O backend solicita e resolve os testes; efeitos ainda sem regra implementada exigem adjudicação local. Pedidos fora do RPG não alteram os fatos da campanha.'
              : message.interactionMode === 'THINK'
                ? 'Seu pensamento permanece privado; ele não foi comunicado aos personagens presentes. O que deseja fazer ou dizer?'
                : imported?.gm?.localAdjudicationRequired
                  ? 'Esta cena requer adjudicação das regras pelo operador local. Sua mensagem está salva; nenhuma consequência nova foi confirmada. Você pode manter sua intenção, escolher outro caminho ou pedir uma pausa.'
                  : `${imported?.publicOpening ?? prepared?.plan.opening ?? 'A cena aguarda sua próxima decisão.'}\n\nNenhuma consequência nova foi confirmada. Como deseja prosseguir?`;
      return this.commit(action, narrative, [], null, null, tx);
    }
    if (!prepared)
      throw new BadRequestException('Scene requires local preparation');
    const plan = prepared.plan;
    if (proposal.kind === 'MECHANIC') {
      if (message.interactionMode !== 'ACT')
        throw new BadRequestException('Mechanical actions require ACT mode');
      const input = proposal.command;
      const actorId =
        input.type === 'ARCANA_USE' || input.type === 'ADVENTURE_ACTION'
          ? input.input.characterId
          : input.characterId;
      const actor = await this.present(action, plan, actorId, tx);
      const selected = mechanicalActionSchema.safeParse(
        message.metadata?.selectedMechanic ??
          message.metadata?.resolvedMechanic,
      );
      if (
        actor.kind === 'PROTAGONIST' &&
        (!selected.success || !isDeepStrictEqual(selected.data, input))
      )
        throw new BadRequestException(
          'A protagonist mechanic must be explicitly selected by the player',
        );
      if (
        actor.kind !== 'PROTAGONIST' &&
        !['COMPANION', 'NPC'].includes(actor.kind)
      )
        throw new BadRequestException('Mechanical actor unavailable');
      if (input.type === 'CURE')
        await this.present(action, plan, input.targetId, tx, true);
      if (
        input.type === 'ARCANA_USE' &&
        (input.input.arcanum === 'body-control' ||
          input.input.arcanum === 'psychic-contact')
      )
        await this.present(action, plan, input.input.targetId, tx);
      if (input.type === 'REST' && actor.kind !== 'PROTAGONIST')
        throw new BadRequestException(
          'Rest duration requires a player decision',
        );
      if (
        input.type === 'ADVENTURE_ACTION' &&
        input.input.action === 'RITUAL_STOP' &&
        actor.kind !== 'PROTAGONIST'
      )
        throw new BadRequestException(
          'Stopping the ritual requires a player decision',
        );
      const requiresRoll =
        input.type === 'CURE' ||
        (input.type === 'ADVENTURE_ACTION' &&
          input.input.action === 'RITUAL_ATTEMPT') ||
        (input.type === 'ARCANA_USE' &&
          !['psychic-shield', 'second-sight'].includes(input.input.arcanum));
      if (requiresRoll && action.status !== 'AWAITING_ROLL') {
        await tx
          .update(n.narrativeActions)
          .set({
            requestId: action.id,
            status: 'AWAITING_ROLL',
            proposal,
            leaseToken: null,
            leaseUntil: null,
            error: null,
          })
          .where(eq(n.narrativeActions.id, action.id));
        return;
      }
      const before = await tx
        .select({ id: g.gameEvents.id })
        .from(g.gameEvents)
        .where(eq(g.gameEvents.campaignId, action.campaignId));
      await this.mechanic(action, input, tx);
      const events = await tx
        .select()
        .from(g.gameEvents)
        .where(
          and(
            eq(g.gameEvents.campaignId, action.campaignId),
            eq(g.gameEvents.visibility, 'PUBLIC'),
          ),
        )
        .orderBy(g.gameEvents.sequence);
      const previous = new Set(before.map((e) => e.id));
      const confirmed = events.filter((e) => !previous.has(e.id));
      return this.commit(
        action,
        confirmed.map((e) => e.description).join('\n') ||
          'Ação mecânica resolvida pelo motor.',
        confirmed.map((e) => e.id),
        null,
        null,
        tx,
      );
    }
    for (const id of plan.presentCharacterIds)
      await this.present(action, plan, id, tx);
    if (proposal.kind === 'ATTACK')
      return this.attack(action, plan, proposal, tx);
    const option = plan.options.find((o) => o.id === proposal.optionId);
    if (
      (message.metadata?.selectedOptionId ??
        message.metadata?.resolvedOptionId) !== proposal.optionId
    )
      throw new BadRequestException(
        'A protagonist action must be explicitly selected by the player',
      );
    if (
      !option ||
      (message.interactionMode === 'REQUEST_CHECK'
        ? option.mode !== 'ACT' || !option.check || option.check.secret
        : option.mode !== message.interactionMode)
    )
      throw new BadRequestException('Unavailable scene option');
    if (option.targetEntityId) {
      const current = await this.context.build(
        action.campaignId,
        action.sessionId,
        tx,
        message.id,
      );
      if (!current.options.some((o) => o.id === option.id))
        throw new ConflictException('Prepared target is no longer available');
    }
    const route = (await this.adventures.guidedRelease(action.campaignId, tx))
      ?.directRoute;
    const loadedForRoute = route
      ? await loadAdventure(action.campaignId, tx)
      : null;
    const selectedRoute =
      route &&
      loadedForRoute &&
      option.id ===
        adventureEntityId(
          action.campaignId,
          `option-${route.sceneKey}-${route.optionKey}`,
          loadedForRoute.instance.entityNamespace,
        )
        ? route
        : null;
    if (
      selectedRoute &&
      (message.metadata?.selectedOptionId !== option.id ||
        message.content.trim() !== selectedRoute.playerText)
    )
      throw new ConflictException(
        'Selecione a rota e envie a confirmação exibida para registrar essa escolha.',
      );
    const normalized = message.content
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (
      !message.metadata?.resolvedOptionId &&
      message.metadata?.queued !== true &&
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
    if (option.arcana === 'CURE_SELF') {
      const request = await this.execute(
        action,
        {
          type: 'ARCANA_CURE_PREPARE',
          characterId: pc.id,
          targetId: pc.id,
          touchConfirmed: true,
          visibility: DiceVisibility.PUBLIC,
          reason: option.intent,
        },
        'cure-prepare',
        tx,
      );
      await this.execute(
        action,
        { type: 'ARCANA_CURE_RESOLVE', requestId: request.id },
        'cure-resolve',
        tx,
      );
      const events = await tx
        .select()
        .from(g.gameEvents)
        .where(
          and(
            eq(g.gameEvents.campaignId, action.campaignId),
            eq(g.gameEvents.commandId, stepId(action.id, 'cure-resolve')),
            eq(g.gameEvents.visibility, 'PUBLIC'),
          ),
        );
      success = events.some(
        (event) =>
          event.type === 'ARCANA_RESOLVED' && event.changes.success === true,
      );
      eventIds.push(...events.map((event) => event.id));
    }
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
    const text = option.arcana
      ? success
        ? 'Curar foi bem-sucedido; a recuperação de Saúde e a fadiga foram resolvidas pelo motor.'
        : 'O teste de Curar falhou; a fadiga foi resolvida pelo motor.'
      : success
        ? option.successText
        : option.failureText;
    if (option.durationMinutes) {
      const time = await this.execute(
        action,
        {
          type: 'NARRATIVE_TIME_ADVANCE',
          minutes: option.durationMinutes,
          reason: option.intent,
        },
        'narrative-time',
        tx,
      );
      eventIds.push(time.id);
    }
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
      await rememberAdventureEvent(
        action.campaignId,
        action.sessionId,
        event.id,
        tx,
        this.adventures,
      );
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
    if (success && selectedRoute && loadedForRoute)
      await confirmGuidedRoute(
        loadedForRoute,
        {
          sessionId: action.sessionId,
          actionId: action.id,
          routeEventId: event.id,
        },
        selectedRoute,
        tx,
      );
    if (success && option.nextSceneKey) {
      const loaded = await loadAdventure(action.campaignId, tx);
      if (!loaded)
        throw new ConflictException('Scene transition requires an adventure');
      await prepareAdventureScene(
        loaded,
        { id: action.sessionId, status: 'IN_PROGRESS' },
        option.nextSceneKey,
        tx,
        this.adventures,
        (
          await tx
            .select({ id: g.characters.id })
            .from(g.characters)
            .where(
              and(
                eq(g.characters.campaignId, action.campaignId),
                eq(g.characters.kind, 'COMPANION'),
                inArray(g.characters.id, plan.presentCharacterIds),
              ),
            )
        ).map((character) => character.id),
      );
      const entered = await this.execute(
        action,
        {
          type: 'EVENT_RECORD',
          eventType: 'ADVENTURE_SCENE_ENTERED',
          description: 'O grupo chegou ao local escolhido pela protagonista.',
          participants: plan.presentCharacterIds,
          visibility: DiceVisibility.PUBLIC,
        },
        'scene-entered',
        tx,
      );
      eventIds.push(entered.id);
    }
    return this.commit(action, text, eventIds, option.id, success, tx);
  }
  private async free(
    action: Action,
    proposal: FreeAction,
    tx: DatabaseTransaction,
  ): Promise<void> {
    const [message] = await tx
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.id, action.playerMessageId));
    if (!message) throw new ConflictException('Missing player message');
    const snapshot = await this.context.build(
      action.campaignId,
      action.sessionId,
      tx,
      message.id,
    );
    const mentions = storedMentions(message.metadata);
    await validateMentions(
      action.campaignId,
      action.sessionId,
      message.content,
      mentions,
      tx,
      this.adventures,
    );
    let result = interpretFreeAction(
      proposal,
      message.interactionMode!,
      snapshot,
      mentions,
    );
    if (result.minutes && !snapshot.adventure)
      result = {
        category: 'ADJUDICATE',
        text: 'O relógio ficcional desta campanha ainda não possui uma política autorizada. A espera não alterou recursos nem acontecimentos.',
      };
    // Canonical sensing/object/wind contexts are never supplied by the LLM.
    if (
      proposal.tool.type === 'ARCANA' &&
      result.reason === 'ARCANE_CONTEXT_REQUIRED' &&
      ['move-object', 'wind-shaping'].includes(proposal.tool.arcanum) &&
      message.interactionMode === 'ACT' &&
      proposal.intent === 'ARCANA'
    ) {
      const [plan] = await tx
        .select()
        .from(n.sessionPlans)
        .where(eq(n.sessionPlans.sessionId, action.sessionId));
      const scope = createHash('sha256')
        .update(JSON.stringify(plan?.plan ?? null))
        .digest('hex');
      const pc = snapshot.characters.find(
        (c) => c.kind === 'PROTAGONIST' && c.available,
      );
      const contexts = pc
        ? await tx
            .select()
            .from(a.arcaneContexts)
            .where(
              and(
                eq(a.arcaneContexts.campaignId, action.campaignId),
                eq(a.arcaneContexts.sessionId, action.sessionId),
                eq(a.arcaneContexts.characterId, pc.id),
                eq(a.arcaneContexts.preparedFor, scope),
              ),
            )
        : [];
      const tool = proposal.tool;
      const matches = contexts.filter(
        (c) =>
          c.value.kind === (tool.arcanum === 'move-object' ? 'OBJECT' : 'WIND'),
      );
      // A context has no object identity yet: only a single authored context and
      // an untargeted attempt are supported; a named object cannot be guessed.
      if (
        pc &&
        matches.length === 1 &&
        proposal.target === null &&
        mentions.length === 0 &&
        (tool.arcanum === 'move-object'
          ? tool.fatigue !== undefined
          : tool.category !== undefined)
      ) {
        result = {
          category: 'MECHANIC',
          text: 'O motor verifica o contexto arcano.',
          command: {
            type: 'ARCANA_USE',
            input:
              tool.arcanum === 'move-object'
                ? {
                    arcanum: 'move-object',
                    characterId: pc.id,
                    contextId: matches[0]!.id,
                    fatigue: tool.fatigue!,
                  }
                : {
                    arcanum: 'wind-shaping',
                    characterId: pc.id,
                    contextId: matches[0]!.id,
                    category: tool.category!,
                  },
          },
        };
      }
    }
    // Curar on someone else cannot infer willingness or touch from a phrase.
    if (
      result.command?.type === 'CURE' &&
      result.command.characterId !== result.command.targetId
    ) {
      const command = result.command;
      const [plan] = await tx
        .select()
        .from(n.sessionPlans)
        .where(eq(n.sessionPlans.sessionId, action.sessionId));
      const scope = createHash('sha256')
        .update(JSON.stringify(plan?.plan ?? null))
        .digest('hex');
      const contexts = await tx
        .select()
        .from(a.arcaneContexts)
        .where(
          and(
            eq(a.arcaneContexts.campaignId, action.campaignId),
            eq(a.arcaneContexts.sessionId, action.sessionId),
            eq(a.arcaneContexts.characterId, command.characterId),
            eq(a.arcaneContexts.preparedFor, scope),
          ),
        );
      if (
        !contexts.some(
          (c) =>
            c.value.kind === 'CREATURE' &&
            c.value.targetId === command.targetId &&
            c.value.touching &&
            c.value.willing,
        )
      )
        result = {
          category: 'ADJUDICATE',
          text: 'Curar esse alvo exige que o toque e o consentimento estejam confirmados. Nenhum recurso foi consumido.',
        };
    }
    const metadata = {
      ...message.metadata,
      freeResolution: {
        category: result.category,
        targetId: result.targetId ?? null,
        querySubject:
          proposal.tool.type === 'QUERY' ? proposal.tool.subject : null,
        selectedTool: proposal.tool.type,
        authorizedTool:
          result.authorizedTool ??
          (result.category === 'MECHANIC'
            ? proposal.tool.type
            : result.category),
        selectionReason: result.reason ?? null,
        expression: proposal.expression ?? null,
        evidence: proposal.evidence ?? [],
        ...(result.dialogueOrigin
          ? { dialogueOrigin: result.dialogueOrigin }
          : {}),
        ...(proposal.tool.type === 'DIALOGUE' &&
        proposal.tool.topic &&
        proposal.tool.act
          ? {
              dialogueSelection: {
                topic: proposal.tool.topic,
                act: proposal.tool.act,
              },
            }
          : {}),
      },
      ...(result.command ? { resolvedMechanic: result.command } : {}),
      ...(result.optionId ? { resolvedOptionId: result.optionId } : {}),
    };
    await tx
      .update(sessionMessages)
      .set({ metadata })
      .where(eq(sessionMessages.id, message.id));
    if (result.command) {
      const mechanic = { kind: 'MECHANIC' as const, command: result.command };
      await tx
        .update(n.narrativeActions)
        .set({ proposal: mechanic })
        .where(eq(n.narrativeActions.id, action.id));
      return this.resolve(action, mechanic, tx);
    }
    if (result.optionId) {
      const scene = { kind: 'SCENE' as const, optionId: result.optionId };
      await tx
        .update(n.narrativeActions)
        .set({ proposal: scene })
        .where(eq(n.narrativeActions.id, action.id));
      return this.resolve(action, scene, tx);
    }
    if (result.combat) {
      const command = result.combat;
      if (command.action === 'ATTACK')
        return this.attack(
          action,
          {
            presentCharacterIds: snapshot.characters
              .filter((c) => c.available)
              .map((c) => c.id),
          },
          {
            kind: 'ATTACK',
            actorId: command.actorId,
            targetId: command.targetId!,
          },
          tx,
          true,
        );
      await this.execute(
        action,
        {
          type: 'COMBAT_ACTION',
          input: {
            commandId: stepId(action.id, 'defend'),
            sessionId: action.sessionId,
            encounterId: command.encounterId,
            characterId: command.actorId,
            action: 'DEFEND',
          },
        },
        'defend',
        tx,
      );
      const events = await tx
        .select()
        .from(g.gameEvents)
        .where(
          and(
            eq(g.gameEvents.campaignId, action.campaignId),
            eq(g.gameEvents.commandId, stepId(action.id, 'defend')),
            eq(g.gameEvents.visibility, 'PUBLIC'),
          ),
        );
      return this.commit(
        action,
        events.map((e) => e.description).join('\n'),
        events.map((e) => e.id),
        null,
        null,
        tx,
      );
    }
    if (result.minutes) {
      // Only an explicit numeric duration is accepted; no guessed time cost.
      const normalized = message.content
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
      if (!new RegExp(`\\b${result.minutes}\\s+minutos?\\b`).test(normalized))
        return this.commit(
          action,
          'Por quantos minutos deseja esperar?',
          [],
          null,
          null,
          tx,
        );
      const event = await this.execute(
        action,
        {
          type: 'NARRATIVE_TIME_ADVANCE',
          minutes: result.minutes,
          reason: 'Espera expressamente escolhida pela jogadora.',
        },
        'free-wait',
        tx,
      );
      return this.commit(
        action,
        `Passaram ${result.minutes} minutos no mundo da campanha.`,
        [event.id],
        null,
        null,
        tx,
      );
    }
    const eventIds: string[] = [];
    if (result.category === 'DIALOGUE') {
      const pc = snapshot.characters.find((c) => c.kind === 'PROTAGONIST');
      const participants = snapshot.characters
        .filter((c) => c.available)
        .map((c) => c.id);
      const event = await this.execute(
        action,
        {
          type: 'EVENT_RECORD',
          eventType: 'SPEECH_RECORDED',
          description: `${pc?.name ?? 'A protagonista'} expressou uma fala/intenção dirigida ao interlocutor (alegação, não fato comprovado): ${message.content.slice(0, 9500)}`,
          participants,
          visibility: DiceVisibility.PUBLIC,
        },
        'free-speech',
        tx,
      );
      eventIds.push(event.id);
      await this.remember(action, event.id, tx);
    }
    if (result.category === 'OBSERVE' && !snapshot.selection)
      result = {
        ...result,
        text: snapshot.scene ?? 'O que deseja observar nesta cena?',
      };
    return this.commit(action, result.text, eventIds, null, null, tx);
  }
  private async remember(
    action: Action,
    eventId: string,
    tx: DatabaseTransaction,
  ) {
    const snapshot = await this.context.build(
      action.campaignId,
      action.sessionId,
      tx,
      action.playerMessageId,
    );
    for (const character of snapshot.characters.filter((c) => c.available))
      await tx
        .insert(n.characterKnowledge)
        .values({
          campaignId: action.campaignId,
          characterId: character.id,
          eventId,
          source: 'HEARD',
          importance: 90,
        })
        .onConflictDoNothing();
    await rememberAdventureEvent(
      action.campaignId,
      action.sessionId,
      eventId,
      tx,
      this.adventures,
    );
  }
  async rememberReply(
    action: Action,
    narration: Narration,
    tx: DatabaseTransaction,
  ) {
    const rendering = await this.context.rendering(
      action.campaignId,
      action.sessionId,
      action.playerMessageId,
      tx,
    );
    if (rendering?.category !== 'DIALOGUE' || !rendering.speaker) return;
    const lines =
      narration.beats
        ?.filter(
          (b) => b.kind === 'DIALOGUE' && b.speakerId === rendering.speaker!.id,
        )
        .map((b) => b.text) ?? [];
    if (!lines.length) return;
    const snapshot = await this.context.build(
      action.campaignId,
      action.sessionId,
      tx,
      action.playerMessageId,
    );
    const event = await this.execute(
      action,
      {
        type: 'EVENT_RECORD',
        eventType: 'NPC_REPLY_RECORDED',
        ...(rendering.speakerOrigin === 'STORY_CARD'
          ? {
              storySpeaker: {
                kind: 'STORY_CARD' as const,
                entityId: rendering.speaker.id,
              },
            }
          : {}),
        description: `${rendering.speaker.name} respondeu (fala atribuída, não verdade do mundo): ${lines.join('\n').slice(0, 9500)}`,
        participants: snapshot.characters
          .filter((c) => c.available)
          .map((c) => c.id),
        visibility: DiceVisibility.PUBLIC,
      },
      'free-reply',
      tx,
    );
    await this.remember(action, event.id, tx);
    return event.id;
  }
  private async resolveStandaloneDeclaration(
    action: Action,
    content: string,
    tx: DatabaseTransaction,
  ) {
    const dice = declaredDice(content);
    if (!dice) return false;
    const requests = await tx
      .select({ id: g.checkRequests.id })
      .from(g.checkRequests)
      .innerJoin(g.characters, eq(g.characters.id, g.checkRequests.characterId))
      .where(
        and(
          eq(g.checkRequests.sessionId, action.sessionId),
          eq(g.checkRequests.campaignId, action.campaignId),
          eq(g.characters.kind, 'PROTAGONIST'),
          eq(g.checkRequests.resolved, false),
          inArray(g.checkRequests.visibility, ['PUBLIC', 'PLAYER_ONLY']),
        ),
      )
      .limit(2);
    if (requests.length !== 1) return false;
    await this.execute(
      action,
      {
        type: 'CHECK_RESOLVE',
        requestId: requests[0]!.id,
        declaredDice: dice,
      },
      'declared-check',
      tx,
    );
    const [roll] = await tx
      .select()
      .from(g.diceRolls)
      .where(eq(g.diceRolls.requestId, requests[0]!.id));
    const [event] = await tx
      .select({ id: g.gameEvents.id })
      .from(g.gameEvents)
      .where(
        and(
          eq(g.gameEvents.sessionId, action.sessionId),
          eq(g.gameEvents.commandId, stepId(action.id, 'declared-check')),
          eq(g.gameEvents.type, 'ABILITY_CHECK'),
        ),
      );
    if (!roll || !event)
      throw new ConflictException('Resultado oficial ausente.');
    await this.commit(
      action,
      `Dados declarados registrados. Total ${roll.total}, ${roll.success ? 'sucesso' : 'falha'}, ${roll.stuntPoints} pontos de façanha.`,
      [event.id],
      null,
      roll.success,
      tx,
    );
    return true;
  }

  async dismount(action: Action, tx: DatabaseTransaction) {
    const loaded = await loadAdventure(action.campaignId, tx);
    const id = loaded?.instance.protagonistId;
    const [mount] = id
      ? await tx
          .select()
          .from(g.campaignMounts)
          .where(
            and(
              eq(g.campaignMounts.riderId, id),
              eq(g.campaignMounts.campaignId, action.campaignId),
              eq(g.campaignMounts.mounted, true),
            ),
          )
      : [];
    if (!id || !mount)
      return this.commit(
        action,
        'Você já está sem montaria em uso.',
        [],
        null,
        null,
        tx,
      );
    const event = await this.execute(
      action,
      { type: 'MOUNT_DISMOUNT', characterId: id },
      'dismount',
      tx,
    );
    return this.commit(
      action,
      'Você desmonta. O cavalo permanece no local.',
      [event.id],
      null,
      null,
      tx,
    );
  }

  async roll(
    action: Action,
    tx: DatabaseTransaction,
    declaredDice?: [number, number, number],
  ) {
    if (
      action.status !== 'AWAITING_ROLL' ||
      !action.requestId ||
      !action.proposal
    )
      throw new ConflictException('No roll pending');
    if (action.proposal.kind === 'MECHANIC')
      return this.resolve(action, action.proposal, tx);
    await this.execute(
      action,
      {
        type: 'CHECK_RESOLVE',
        requestId: action.requestId,
        ...(declaredDice && { declaredDice }),
      },
      'check-resolve',
      tx,
    );
    return this.resolve(action, action.proposal, tx);
  }
  private async mechanic(
    action: Action,
    input: MechanicalAction,
    tx: DatabaseTransaction,
  ) {
    if (input.type === 'CURE') {
      const request = await this.execute(
        action,
        {
          type: 'ARCANA_CURE_PREPARE',
          characterId: input.characterId,
          targetId: input.targetId,
          touchConfirmed: true,
          visibility: DiceVisibility.PUBLIC,
          reason: 'Tentativa de Curar confirmada nesta cena.',
        },
        'mechanic-cure-prepare',
        tx,
      );
      return this.execute(
        action,
        { type: 'ARCANA_CURE_RESOLVE', requestId: request.id },
        'mechanic-cure-resolve',
        tx,
      );
    }
    if (input.type === 'REST') {
      return this.execute(
        action,
        { ...input, reason: 'Repouso escolhido pela jogadora.' },
        'mechanic-rest',
        tx,
      );
    }
    return this.execute(action, input, 'mechanic-arcana', tx);
  }
  private async present(
    action: Action,
    plan: Pick<ScenePlan, 'presentCharacterIds'>,
    id: string,
    tx: DatabaseTransaction,
    allowIncapacitated = false,
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
      (allowIncapacitated
        ? row.vitals.lifeState === 'DEAD'
        : row.vitals.lifeState !== 'ALIVE') ||
      !row.vitals.living
    )
      throw new ConflictException('Character unavailable in this scene');
    return row.character;
  }
  private async attack(
    action: Action,
    plan: Pick<ScenePlan, 'presentCharacterIds'>,
    proposal: Extract<NarrativeProposal, { kind: 'ATTACK' }>,
    tx: DatabaseTransaction,
    playerAuthorized = false,
  ) {
    const actor = await this.present(action, plan, proposal.actorId, tx);
    await this.present(action, plan, proposal.targetId, tx);
    if (actor.kind === 'PROTAGONIST' && !playerAuthorized)
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
