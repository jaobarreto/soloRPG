import { guidedParty } from '../adventures/core/state/guided-party';
import { BlueRoseTestsService } from '../blue-rose/mechanics/tests/tests.service';
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, max, sql } from 'drizzle-orm';
import {
  abilities,
  combatActionSchema,
  combatResolveSchema,
  arcanaResolveSchema,
  checkInputSchema,
  createCharacterSchema,
  editCharacterSchema,
  inventoryActionSchema,
  rollInputSchema,
} from '@solo-rpg/shared-contracts';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service';
import * as s from '../database/game-schema';
import { narrativeActions, sessionPlans } from '../database/narrative-schema';
import { CampaignsRepository } from '../campaigns/campaigns.repository';
import { SessionsRepository } from '../sessions/sessions.repository';
import { MessagesRepository } from '../messages/messages.repository';
import { BlueRoseDice } from '../blue-rose/mechanics/dice/blue-rose-dice';
import { restMinutes } from '../blue-rose/mechanics/recovery/recovery.rules';
import { validateSheetFeatures } from '../blue-rose/sheets/sheet-validation';
import { GameRepository } from '../database/game.repository';
import {
  commandEnvelopeSchema,
  type CommandEnvelope,
  type EngineCommand,
} from './commands';
import { parseInput } from './validation';

import type { Audit, GameContext } from './context';
import { BlueRoseCombatService } from '../blue-rose/mechanics/combat/combat.service';
import { BlueRoseArcanaService } from '../blue-rose/arcana/arcana.service';
import { BlueRoseArcanaExecutionService } from '../blue-rose/arcana/arcana-execution.service';
import { AdventureRegistry } from '../adventures/core/registry/registry';
import { adventureInstances } from '../database/adventure-schema';
import {
  adventureEntityId,
  loadAdventure,
} from '../adventures/core/state/state';
@Injectable()
export class GameEngineService {
  constructor(
    private readonly database: DatabaseService,
    private readonly campaigns: CampaignsRepository,
    private readonly sessions: SessionsRepository,
    private readonly messages: MessagesRepository,
    private readonly repository: GameRepository,
    private readonly dice: BlueRoseDice,
    private readonly combat: BlueRoseCombatService,
    private readonly arcana: BlueRoseArcanaService,
    private readonly arcanaExecution: BlueRoseArcanaExecutionService,
    private readonly tests: BlueRoseTestsService,
    private readonly adventures: AdventureRegistry,
  ) {}

  // Only the local CLI and server code receive this capability. No HTTP route dispatches internal commands.
  async executeInternal(input: unknown) {
    return this.execute(parseInput(commandEnvelopeSchema, input), 'INTERNAL');
  }
  // Local import composition only; never reachable through the AI proposal adapter.
  async executeLocalInTransaction(
    input: CommandEnvelope,
    tx: DatabaseTransaction,
  ) {
    return this.executeInTransaction(
      parseInput(commandEnvelopeSchema, input),
      'INTERNAL',
      tx,
    );
  }
  // Private adventure adapter composes its receipt in this same transaction.
  // This capability is intentionally absent from HTTP and the narrative allowlist.
  async executeAdventureLocalInTransaction(
    raw: unknown,
    campaignId: string,
    tx: DatabaseTransaction,
    emit: (
      type: string,
      description: string,
      visibility: 'PUBLIC' | 'GM_ONLY',
      changes: Record<string, unknown>,
    ) => Promise<typeof s.gameEvents.$inferSelect>,
  ) {
    const campaign = await this.campaigns.lock(campaignId, tx);
    if (!campaign || campaign.status !== 'ACTIVE')
      throw new ConflictException(
        'Adventure commands require an active campaign',
      );
    const loaded = await loadAdventure(campaignId, tx);
    if (!loaded) throw new NotFoundException('Adventure not imported');
    const module = this.adventures.forDefinition(loaded.definition);
    if (!module.commandSchema || !module.executeCommand)
      throw new BadRequestException('Unsupported adventure command');
    const input = parseInput(module.commandSchema, raw);
    if (input.campaignId !== campaignId)
      throw new BadRequestException(
        'Adventure command belongs to another campaign',
      );
    const session = await this.sessions.lock(campaignId, input.sessionId, tx);
    if (session?.status !== 'IN_PROGRESS')
      throw new ConflictException('Active session required');
    const [pending] = await tx
      .select()
      .from(narrativeActions)
      .where(
        and(
          eq(narrativeActions.campaignId, campaignId),
          sql`${narrativeActions.status} NOT IN ('COMPLETED','REJECTED')`,
        ),
      );
    if (pending)
      throw new ConflictException('Resolve the pending narrative action first');
    if (await this.combat.active(campaignId, tx))
      throw new ConflictException('Resolve active combat first');
    module.assertIdle?.(loaded.instance.mechanics, input.operation);
    const result = await module.executeCommand(input, {
      definition: loaded.definition,
      state: loaded.instance.mechanics,
      tx,
      dice: this.dice,
      emit,
    });
    const minutes = module.commandDurationMinutes?.(input) ?? 0;
    if (minutes !== 0)
      await this.recordNarrativeTime(campaignId, minutes, tx, (audit) =>
        emit(audit.type, audit.description, 'PUBLIC', audit.changes),
      );
    return result;
  }
  private async recordNarrativeTime(
    campaignId: string,
    minutes: number,
    tx: DatabaseTransaction,
    emit: (audit: Audit) => Promise<typeof s.gameEvents.$inferSelect>,
  ) {
    const loaded = await loadAdventure(campaignId, tx);
    if (
      !loaded ||
      !Number.isInteger(minutes) ||
      minutes < 1 ||
      minutes > 1440 ||
      loaded.instance.narrativeMinutes + minutes > 2147483647
    )
      throw new ConflictException('Invalid narrative clock advance');
    const totalMinutes = loaded.instance.narrativeMinutes + minutes;
    await tx
      .update(adventureInstances)
      .set({ narrativeMinutes: totalMinutes })
      .where(eq(adventureInstances.campaignId, campaignId));
    return emit({
      type: 'NARRATIVE_TIME_ADVANCED',
      description: `Passaram ${minutes} minutos no mundo da campanha.`,
      changes: { minutes, totalMinutes },
    });
  }
  async createCharacter(campaignId: string, input: unknown) {
    const sheet = parseInput(createCharacterSchema, input);
    return this.execute(
      {
        campaignId,
        commandId: sheet.commandId,
        command: {
          type: 'CHARACTER_CREATE',
          sheet,
          kind: 'PROTAGONIST',
          known: true,
          living: true,
          privateNotes: '',
          privateObjectives: '',
          personality: '',
          motivations: '',
          state: '',
        },
      },
      'PLAYER',
    );
  }
  async editCharacter(id: string, input: unknown) {
    const patch = parseInput(editCharacterSchema, input),
      character = await this.repository.visibleCharacter(id);
    if (character.kind !== 'PROTAGONIST')
      throw new ForbiddenException(
        'Only the protagonist profile can be edited',
      );
    const active = (await this.sessions.list(character.campaignId)).find(
      (row) => row.status === 'IN_PROGRESS',
    );
    return this.execute(
      {
        campaignId: character.campaignId,
        sessionId: active?.id,
        commandId: patch.commandId,
        command: { type: 'CHARACTER_EDIT', characterId: id, patch },
      },
      'PLAYER',
    );
  }
  async roll(campaignId: string, input: unknown) {
    const parsed = parseInput(rollInputSchema, input);
    return this.execute(
      { campaignId, ...parsed, command: { type: 'ROLL' } },
      'PLAYER',
    );
  }
  async check(campaignId: string, input: unknown) {
    const parsed = parseInput(checkInputSchema, input),
      special = await this.tests.lookup(campaignId, parsed.requestId);
    if (special) {
      if (special.visibility === 'GM_ONLY')
        throw new NotFoundException('Check request not found');
      return this.execute(
        {
          campaignId,
          sessionId: special.sessionId,
          commandId: parsed.commandId,
          command: { type: 'SPECIAL_CHECK_RESOLVE', requestId: special.id },
        },
        'PLAYER',
      );
    }
    const check = await this.repository.check(campaignId, parsed.requestId);
    if (check.visibility === 'GM_ONLY')
      throw new NotFoundException('Check request not found');
    return this.execute(
      {
        campaignId,
        sessionId: check.sessionId,
        commandId: parsed.commandId,
        command: { type: 'CHECK_RESOLVE', requestId: check.id },
      },
      'PLAYER',
    );
  }
  async inventoryAction(id: string, input: unknown) {
    const parsed = parseInput(inventoryActionSchema, input),
      character = await this.repository.visibleCharacter(id);
    if (character.kind !== 'PROTAGONIST')
      throw new ForbiddenException(
        'Only protagonist inventory is controlled by the player',
      );
    return this.execute(
      {
        campaignId: character.campaignId,
        sessionId: parsed.sessionId,
        commandId: parsed.commandId,
        command: { type: 'INVENTORY_ACTION', characterId: id, input: parsed },
      },
      'PLAYER',
    );
  }
  async combatAction(campaignId: string, input: unknown) {
    const parsed = parseInput(combatActionSchema, input);
    return this.execute(
      {
        campaignId,
        sessionId: parsed.sessionId,
        commandId: parsed.commandId,
        command: { type: 'COMBAT_ACTION', input: parsed },
      },
      'PLAYER',
    );
  }
  async resolveStunts(campaignId: string, input: unknown) {
    const parsed = parseInput(combatResolveSchema, input);
    return this.execute(
      {
        campaignId,
        sessionId: parsed.sessionId,
        commandId: parsed.commandId,
        command: { type: 'COMBAT_RESOLVE', input: parsed },
      },
      'PLAYER',
    );
  }
  async resolveCure(campaignId: string, input: unknown) {
    const parsed = parseInput(arcanaResolveSchema, input),
      request = await this.arcana.request(campaignId, parsed.requestId);
    return this.execute(
      {
        campaignId,
        sessionId: request.sessionId,
        commandId: parsed.commandId,
        command: { type: 'ARCANA_CURE_RESOLVE', requestId: parsed.requestId },
      },
      'PLAYER',
    );
  }
  private execute(
    envelope: CommandEnvelope,
    audience: 'PLAYER' | 'INTERNAL',
  ): Promise<{ id: string }> {
    return this.database.db.transaction((tx) =>
      this.executeInTransaction(envelope, audience, tx),
    );
  }
  // Trusted server adapter only. The caller commits its action receipt in this same transaction.
  async executeNarrativeCommand(
    envelope: CommandEnvelope,
    tx: DatabaseTransaction,
    actionId: string,
  ) {
    if (
      ![
        'NARRATIVE_TIME_ADVANCE',
        'ARCANA_CURE_PREPARE',
        'ARCANA_CURE_RESOLVE',
        'ARCANA_USE',
        'ADVENTURE_ACTION',
        'ARCANA_END',
        'REST',
        'CHECK_PREPARE',
        'CHECK_RESOLVE',
        'COMBAT_ACTION',
        'COMBAT_RESOLVE',
        'INVENTORY_ACTION',
        'MOUNT_DISMOUNT',
        'RELATIONSHIP_SET',
        'WORLD_UPSERT',
        'EVENT_RECORD',
      ].includes(envelope.command.type)
    )
      throw new ForbiddenException(
        'Command unavailable to the narrative adapter',
      );
    return this.executeInTransaction(envelope, 'INTERNAL', tx, actionId);
  }
  private async executeInTransaction(
    envelope: CommandEnvelope,
    audience: 'PLAYER' | 'INTERNAL',
    tx: DatabaseTransaction,
    narrativeActionId?: string,
  ): Promise<{ id: string }> {
    const { campaignId, sessionId, commandId, command } = envelope;
    const digest = createHash('sha256')
      .update(JSON.stringify({ audience, ...envelope }))
      .digest('hex');
    const campaign = await this.campaigns.lock(campaignId, tx);
    if (!campaign) throw new NotFoundException('Campaign not found');
    const [receipt] = await tx
      .select()
      .from(s.gameCommands)
      .where(
        and(
          eq(s.gameCommands.campaignId, campaignId),
          eq(s.gameCommands.commandId, commandId),
        ),
      );
    if (receipt) {
      if (receipt.digest !== digest)
        throw new ConflictException(
          'Command key already used with different input',
        );
      return { id: String(receipt.result.id) };
    }
    const [turn] = await tx
      .select()
      .from(narrativeActions)
      .where(
        and(
          eq(narrativeActions.campaignId, campaignId),
          sql`${narrativeActions.status} NOT IN ('COMPLETED','REJECTED')`,
        ),
      );
    if (
      narrativeActionId &&
      (!turn || turn.id !== narrativeActionId || turn.sessionId !== sessionId)
    )
      throw new ConflictException('Narrative action is not active');
    if (turn && turn.id !== narrativeActionId)
      throw new ConflictException('Resolve the pending narrative action first');
    if (campaign.status === 'COMPLETED')
      throw new ConflictException('Campaign is completed');
    const imported = await loadAdventure(campaignId, tx);
    if (imported)
      await this.adventures
        .forDefinition(imported.definition)
        .validateEngineCommand?.(command, imported.instance.mechanics, tx);
    if (sessionId) {
      const session = await this.sessions.lock(campaignId, sessionId, tx);
      if (!session)
        throw new NotFoundException('Session not found in campaign');
      if (session.status !== 'IN_PROGRESS')
        throw new ConflictException('Session must be in progress');
    } else if (campaign.status !== 'DRAFT')
      throw new ConflictException(
        'Active campaign commands require an in-progress session',
      );
    if (
      ['ROLL', 'CHECK_PREPARE', 'CHECK_RESOLVE', 'INVENTORY_ACTION'].includes(
        command.type,
      ) &&
      !sessionId
    )
      throw new ConflictException('Session required');
    if (
      audience === 'PLAYER' &&
      command.type === 'CHARACTER_CREATE' &&
      campaign.status !== 'DRAFT'
    )
      throw new ConflictException(
        'Character transcription is only available before play',
      );
    const guided = await this.adventures.guidedRelease(campaignId, tx);
    const selection =
      sessionId && guided ? await guidedParty(campaignId, tx) : null;
    const absent = selection
      ? (
          await tx
            .select({ id: s.characters.id })
            .from(s.characters)
            .where(
              and(
                eq(s.characters.campaignId, campaignId),
                eq(s.characters.kind, 'COMPANION'),
              ),
            )
        )
          .map((row) => row.id)
          .filter((id) => !selection.companionIds.includes(id))
      : [];
    const assertActiveParty = (ids: unknown[]) => {
      if (ids.some((id) => typeof id === 'string' && absent.includes(id)))
        throw new ConflictException(
          'Este companheiro não integra a composição da sessão.',
        );
    };
    if (absent.length) {
      const direct = command as Record<string, unknown>;
      const input =
        'input' in command ? (command.input as Record<string, unknown>) : {};
      assertActiveParty([
        direct.characterId,
        direct.opponentId,
        direct.targetId,
        direct.fromCharacterId,
        direct.toCharacterId,
        input.characterId,
        input.targetId,
        input.toCharacterId,
      ]);
    }
    const emit = async (audit: Audit) => {
      let visibility =
        guided && !sessionId
          ? ('GM_ONLY' as const)
          : (audit.visibility ?? 'PUBLIC');
      const participants = [...new Set(audit.participants ?? [])];
      assertActiveParty(participants);
      for (const id of participants)
        if (!(await this.repository.character(campaignId, id, tx)).known)
          visibility = 'GM_ONLY';
      const [last] =
        visibility === 'GM_ONLY'
          ? []
          : await tx
              .select({ value: max(s.gameEvents.publicSequence) })
              .from(s.gameEvents)
              .where(eq(s.gameEvents.campaignId, campaignId));
      const publicSequence =
        visibility === 'GM_ONLY' ? null : (last?.value ?? 0) + 1;
      const [event] = await tx
        .insert(s.gameEvents)
        .values({
          campaignId,
          sessionId,
          commandId,
          type: audit.type,
          description: audit.description,
          changes: audit.changes,
          visibility,
          publicSequence,
        })
        .returning();
      if (!event) throw new Error('Missing event');
      if (participants.length)
        await tx.insert(s.eventParticipants).values(
          participants.map((characterId) => ({
            campaignId,
            eventId: event.id,
            characterId,
          })),
        );
      return event;
    };
    const activeCombat = await this.combat.active(campaignId, tx);
    if (activeCombat) {
      const [pending] = await tx
        .select()
        .from(s.combatAttacks)
        .where(
          and(
            eq(s.combatAttacks.encounterId, activeCombat.id),
            eq(s.combatAttacks.resolved, false),
          ),
        );
      if (
        pending &&
        !['COMBAT_ACTION', 'COMBAT_RESOLVE', 'COMBAT_END'].includes(
          command.type,
        )
      )
        throw new ConflictException(
          audience === 'PLAYER' && activeCombat.visibility === 'GM_ONLY'
            ? 'Action unavailable in current scene'
            : 'Resolve pending Stunts before other commands',
        );
      if (command.type === 'INVENTORY_ACTION')
        throw new ConflictException(
          audience === 'PLAYER' && activeCombat.visibility === 'GM_ONLY'
            ? 'Action unavailable in current scene'
            : 'Inventory equipment is locked during encounters',
        );
    }
    const result = await this.apply(command, envelope, audience, tx, emit);
    await tx
      .insert(s.gameCommands)
      .values({ campaignId, commandId, digest, result });
    return result;
  }
  private async apply(
    c: EngineCommand,
    env: CommandEnvelope,
    audience: 'PLAYER' | 'INTERNAL',
    tx: DatabaseTransaction,
    emit: (audit: Audit) => Promise<typeof s.gameEvents.$inferSelect>,
  ): Promise<{ id: string }> {
    const { campaignId, sessionId } = env;
    const character = (id: string) =>
      this.repository.character(campaignId, id, tx);
    const [scene] = sessionId
      ? await tx
          .select()
          .from(sessionPlans)
          .where(eq(sessionPlans.sessionId, sessionId))
      : [];
    const context: GameContext = {
      ...env,
      audience,
      sceneScope: createHash('sha256')
        .update(JSON.stringify(scene?.plan ?? null))
        .digest('hex'),
      tx,
      emit,
      recordRoll: (result, visibility, reason, characterId, requestId) =>
        this.persistRoll(
          result,
          env,
          visibility,
          reason,
          tx,
          emit,
          characterId,
          requestId,
        ),
    };
    switch (c.type) {
      case 'ADVENTURE_ACTION': {
        if (!sessionId || (await this.combat.active(campaignId, tx)))
          throw new ConflictException(
            'Adventure action requires narrative time in an active session',
          );
        const loaded = await loadAdventure(campaignId, tx);
        if (!loaded) throw new ConflictException('Adventure instance required');
        const module = this.adventures.forDefinition(loaded.definition);
        if (!module.executeNarrativeAction)
          throw new BadRequestException('Adventure action unsupported');
        let id = env.commandId;
        await module.executeNarrativeAction(
          c.input,
          { campaignId, sessionId, commandId: env.commandId },
          {
            definition: loaded.definition,
            state: loaded.instance.mechanics,
            tx,
            dice: this.dice,
            emit: async (type, description, visibility, changes) => {
              const event = await emit({
                type,
                description,
                visibility,
                changes,
              });
              id = event.id;
              return event;
            },
          },
        );
        return { id };
      }
      case 'NARRATIVE_TIME_ADVANCE': {
        if (!sessionId)
          throw new ConflictException(
            'Narrative time requires an active session',
          );
        const loaded = await loadAdventure(campaignId, tx);
        if (!loaded)
          throw new ConflictException(
            'Narrative time requires an adventure instance',
          );
        const module = this.adventures.forDefinition(loaded.definition);
        await module.advanceTime?.(
          { ...env, sessionId, minutes: c.minutes, reason: c.reason },
          {
            definition: loaded.definition,
            state: loaded.instance.mechanics,
            tx,
            dice: this.dice,
            emit: (type, description, visibility, changes) =>
              emit({ type, description, visibility, changes }),
          },
        );
        return {
          id: (await this.recordNarrativeTime(campaignId, c.minutes, tx, emit))
            .id,
        };
      }

      case 'SCENE_CONFIGURE': {
        if (await this.adventures.guidedRelease(campaignId, tx))
          throw new ConflictException(
            'Use a preparação de cenas da aventura da biblioteca.',
          );
        const session = await this.sessions.find(
          campaignId,
          c.targetSessionId,
          tx,
        );
        if (!session || !['LOCKED', 'AVAILABLE'].includes(session.status))
          throw new ConflictException(
            'Prepare scenes before starting the session',
          );
        for (const id of c.plan.presentCharacterIds) {
          const npc = await character(id);
          if (!npc.known)
            throw new ConflictException('Scene participants must be public');
        }
        const ids = c.plan.options.map((o) => o.id);
        if (
          new Set(ids).size !== ids.length ||
          new Set(c.plan.objectives.map((o) => o.id)).size !==
            c.plan.objectives.length
        )
          throw new BadRequestException('Duplicate plan IDs');
        for (const option of c.plan.options) {
          if (
            option.requiresOptionIds.some(
              (id) => !ids.includes(id) || id === option.id,
            ) ||
            option.witnesses.some(
              (id) => !c.plan.presentCharacterIds.includes(id),
            )
          )
            throw new BadRequestException('Invalid scene prerequisites');
        }
        if (
          c.plan.objectives.some((o) =>
            o.requiredOptionIds.some((id) => !ids.includes(id)),
          )
        )
          throw new BadRequestException('Unknown objective criterion');
        await tx
          .insert(sessionPlans)
          .values({ campaignId, sessionId: session.id, plan: c.plan })
          .onConflictDoUpdate({
            target: sessionPlans.sessionId,
            set: { plan: c.plan },
          });
        return {
          id: (
            await emit({
              type: 'SCENE_PREPARED',
              description: 'Preparação narrativa local',
              changes: { sessionId: session.id },
              visibility: 'GM_ONLY',
            })
          ).id,
        };
      }

      case 'CHECK_PREPARE':
      case 'CHECK_RESOLVE':
      case 'ROLL':
      case 'OPPOSED_PREPARE':
      case 'ADVANCED_CREATE':
      case 'ADVANCED_PREPARE':
      case 'SPECIAL_CHECK_RESOLVE':
        return this.tests.apply(c, context);
      case 'COMBAT_CONFIGURE':
      case 'COMBAT_END':
      case 'COMBAT_ACTION':
      case 'COMBAT_RESOLVE':
        return this.combat.apply(c, context);
      case 'COMBAT_START':
        await this.arcanaExecution.requireNoSustainedEffects(context);
        return this.combat.apply(c, context);
      case 'ARCANA_USE':
      case 'ARCANA_CONTEXT_SET':
      case 'ARCANA_END':
        return this.arcanaExecution.apply(c, context);
      case 'ARCANA_CURE_PREPARE':
      case 'ARCANA_CURE_RESOLVE': {
        const result = await this.arcana.apply(c, context);
        if (c.type === 'ARCANA_CURE_RESOLVE') {
          const [request] = await tx
            .select()
            .from(s.arcanaRequests)
            .where(eq(s.arcanaRequests.id, c.requestId));
          if (request)
            await this.arcanaExecution.endIfIncapacitated(
              request.characterId,
              context,
            );
        }
        return result;
      }
      case 'REST': {
        await this.arcanaExecution.endSustained(
          c.characterId,
          'O repouso encerrou a concentração arcana.',
          context,
        );
        if (await loadAdventure(campaignId, tx))
          await this.apply(
            {
              type: 'NARRATIVE_TIME_ADVANCE',
              minutes: restMinutes[c.kind],
              reason: 'Tempo ficcional do repouso concluído.',
            },
            env,
            audience,
            tx,
            emit,
          );
        return this.arcana.apply(c, context);
      }

      case 'CHARACTER_CREATE': {
        const [existing] = await tx
          .select()
          .from(s.characters)
          .where(
            and(
              eq(s.characters.campaignId, campaignId),
              eq(s.characters.kind, 'PROTAGONIST'),
            ),
          );
        if (c.kind === 'PROTAGONIST' && existing)
          throw new ConflictException('Campaign already has a protagonist');
        const sheet = c.sheet;
        await validateSheetFeatures(sheet, tx);
        const [row] = await tx
          .insert(s.characters)
          .values({
            campaignId,
            kind: c.kind,
            known: c.kind === 'PROTAGONIST' || c.known,
            name: sheet.name,
            description: sheet.description,
            people: sheet.people,
            characterClass: sheet.characterClass,
            background: sheet.background,
            level: sheet.level,
            calling: sheet.calling,
            destiny: sheet.destiny,
            fate: sheet.fate,
            personality: c.personality,
            motivations: c.motivations,
            state: c.state,
          })
          .returning();
        if (!row) throw new Error('Missing character');
        await tx
          .insert(s.characterVitals)
          .values({ characterId: row.id, living: c.living });
        if (row.kind === 'PROTAGONIST') {
          const conviction = 3 + Math.floor((row.level - 1) / 2);
          await tx.insert(s.characterResources).values({
            characterId: row.id,
            name: 'CONVICTION',
            current: conviction,
            maximum: conviction,
          });
        }
        await tx.insert(s.characterSecrets).values({
          characterId: row.id,
          notes: c.privateNotes,
          objectives: c.privateObjectives,
        });
        await tx.insert(s.characterAbilities).values(
          abilities.map((ability) => ({
            characterId: row.id,
            ability,
            score: sheet.abilities[ability],
          })),
        );
        await tx.insert(s.characterResources).values({
          characterId: row.id,
          name: 'HEALTH',
          current: sheet.maxHealth,
          maximum: sheet.maxHealth,
        });
        if (sheet.features.length)
          await tx
            .insert(s.characterFeatures)
            .values(sheet.features.map((f) => ({ characterId: row.id, ...f })));
        const details = [...new Set(sheet.languages)].map((value) => ({
          characterId: row.id,
          kind: 'LANGUAGE' as const,
          value,
        }));
        if (details.length) await tx.insert(s.characterDetails).values(details);
        if (sheet.goals.length)
          await tx.insert(s.characterDetails).values(
            [...new Set(sheet.goals)].map((value) => ({
              characterId: row.id,
              kind: 'GOAL' as const,
              value,
            })),
          );
        await emit({
          type: 'CHARACTER_CREATED',
          description: `Personagem registrado: ${sheet.name}`,
          participants: [row.id],
          changes: { characterId: row.id, kind: c.kind },
          visibility: row.known ? 'PUBLIC' : 'GM_ONLY',
        });
        return { id: row.id };
      }
      case 'CHARACTER_EDIT': {
        const row = await character(c.characterId);
        if (audience === 'PLAYER' && row.kind !== 'PROTAGONIST')
          throw new ForbiddenException();
        const { name, description, goals } = c.patch;
        if (name !== undefined || description !== undefined)
          await tx
            .update(s.characters)
            .set({ name, description })
            .where(eq(s.characters.id, row.id));
        if (goals !== undefined) {
          await tx
            .delete(s.characterDetails)
            .where(
              and(
                eq(s.characterDetails.characterId, row.id),
                eq(s.characterDetails.kind, 'GOAL'),
              ),
            );
          if (goals.length)
            await tx.insert(s.characterDetails).values(
              [...new Set(goals)].map((value) => ({
                characterId: row.id,
                kind: 'GOAL' as const,
                value,
              })),
            );
        }
        await emit({
          type: 'CHARACTER_PROFILE_UPDATED',
          description: 'Perfil atualizado',
          participants: [row.id],
          changes: { name, description, goals },
        });
        return { id: row.id };
      }
      case 'CHARACTER_REVEAL': {
        const row = await character(c.characterId);
        await tx
          .update(s.characters)
          .set({ known: true })
          .where(eq(s.characters.id, row.id));
        await emit({
          type: 'CHARACTER_REVEALED',
          description: c.reason,
          participants: [row.id],
          changes: { known: true },
        });
        return { id: row.id };
      }
      case 'ABILITY_SET': {
        await character(c.characterId);
        await tx
          .update(s.characterAbilities)
          .set({ score: c.score })
          .where(
            and(
              eq(s.characterAbilities.characterId, c.characterId),
              eq(s.characterAbilities.ability, c.ability),
            ),
          );
        await emit({
          type: 'ABILITY_CORRECTED',
          description: c.reason,
          participants: [c.characterId],
          changes: { ability: c.ability, score: c.score },
          visibility: 'GM_ONLY',
        });
        return { id: c.characterId };
      }
      case 'MOUNT_DISMOUNT': {
        if (!sessionId || audience !== 'INTERNAL')
          throw new ForbiddenException();
        const [mount] = await tx
          .update(s.campaignMounts)
          .set({ mounted: false })
          .where(
            and(
              eq(s.campaignMounts.campaignId, campaignId),
              eq(s.campaignMounts.riderId, c.characterId),
              eq(s.campaignMounts.mounted, true),
            ),
          )
          .returning();
        if (!mount) throw new ConflictException('Não há montaria em uso.');
        const event = await emit({
          type: 'MOUNT_DISMOUNTED',
          description: 'A protagonista desmontou.',
          participants: [c.characterId],
          changes: { mountId: mount.characterId },
        });
        return { id: event.id };
      }
      case 'MOUNT_DAMAGE': {
        const [mount] = await tx
          .select()
          .from(s.campaignMounts)
          .where(
            and(
              eq(s.campaignMounts.campaignId, campaignId),
              eq(s.campaignMounts.characterId, c.characterId),
            ),
          );
        if (!mount || !sessionId || audience !== 'INTERNAL')
          throw new ConflictException(
            'Dano exige uma montaria da sessão e confirmação autorizada.',
          );
        const [health] = await tx
          .select()
          .from(s.characterResources)
          .where(
            and(
              eq(s.characterResources.characterId, c.characterId),
              eq(s.characterResources.name, 'HEALTH'),
            ),
          );
        if (!health || health.current === 0)
          throw new ConflictException('A montaria não está viva.');
        const current = Math.max(0, health.current - c.damage);
        await tx
          .update(s.characterResources)
          .set({ current })
          .where(
            and(
              eq(s.characterResources.characterId, c.characterId),
              eq(s.characterResources.name, 'HEALTH'),
            ),
          );
        if (current === 0) {
          await tx
            .update(s.characterVitals)
            .set({ lifeState: 'DEAD', living: false })
            .where(eq(s.characterVitals.characterId, c.characterId));
          await tx
            .update(s.campaignMounts)
            .set({ mounted: false })
            .where(eq(s.campaignMounts.characterId, c.characterId));
        }
        const event = await emit({
          type: 'DAMAGE_APPLIED',
          description: c.reason,
          participants: [c.characterId],
          changes: {
            damage: health.current - current,
            current,
            lifeState: current ? 'ALIVE' : 'DEAD',
          },
        });
        return { id: event.id };
      }
      case 'RESOURCE_SET': {
        await character(c.characterId);
        if (c.current > c.maximum)
          throw new BadRequestException('Resource exceeds maximum');
        const [before] = await tx
          .select()
          .from(s.characterResources)
          .where(
            and(
              eq(s.characterResources.characterId, c.characterId),
              eq(s.characterResources.name, c.name),
            ),
          );
        await tx
          .insert(s.characterResources)
          .values({
            characterId: c.characterId,
            name: c.name,
            current: c.current,
            maximum: c.maximum,
          })
          .onConflictDoUpdate({
            target: [
              s.characterResources.characterId,
              s.characterResources.name,
            ],
            set: { current: c.current, maximum: c.maximum },
          });
        if (c.name === 'HEALTH' && c.current > 0)
          await tx
            .update(s.characterVitals)
            .set({ lifeState: 'ALIVE', unconsciousHours: null })
            .where(
              and(
                eq(s.characterVitals.characterId, c.characterId),
                eq(s.characterVitals.lifeState, 'DYING'),
              ),
            );
        await emit({
          type: 'RESOURCE_CORRECTED',
          description: c.reason,
          participants: [c.characterId],
          changes: {
            name: c.name,
            before: before?.current ?? null,
            current: c.current,
            maximum: c.maximum,
          },
        });
        return { id: c.characterId };
      }
      case 'CONDITION_APPLY': {
        await character(c.characterId);
        const [row] = await tx
          .insert(s.characterConditions)
          .values({
            characterId: c.characterId,
            name: c.name,
            description: c.description,
            visibility: c.visibility,
          })
          .returning();
        if (!row) throw new Error('Missing condition');
        await emit({
          type: 'CONDITION_APPLIED',
          description: c.reason,
          participants: [c.characterId],
          changes: { conditionId: row.id, name: c.name },
          visibility: c.visibility,
        });
        return { id: row.id };
      }
      case 'CONDITION_REMOVE': {
        await character(c.characterId);
        const [row] = await tx
          .delete(s.characterConditions)
          .where(
            and(
              eq(s.characterConditions.id, c.conditionId),
              eq(s.characterConditions.characterId, c.characterId),
            ),
          )
          .returning();
        if (!row) throw new NotFoundException('Condition not found');
        if (row.ruleKey)
          throw new BadRequestException(
            'Use the official engine action to remove this condition',
          );
        await emit({
          type: 'CONDITION_REMOVED',
          description: c.reason,
          participants: [c.characterId],
          changes: { conditionId: row.id },
          visibility: row.visibility,
        });
        return { id: row.id };
      }
      case 'ITEM_CREATE': {
        const [row] = await tx
          .insert(s.gameItems)
          .values({
            campaignId,
            name: c.name,
            description: c.description,
            consumable: c.consumable,
            equipmentRuleId: c.equipmentRuleId,
            visibility: c.visibility,
          })
          .returning();
        if (!row) throw new Error('Missing item');
        await emit({
          type: 'ITEM_REGISTERED',
          description: 'Item narrativo registrado',
          changes: { itemId: row.id, name: c.name },
          visibility: c.visibility,
        });
        return { id: row.id };
      }
      case 'ITEM_GRANT': {
        await character(c.characterId);
        const [item] = await tx
          .select()
          .from(s.gameItems)
          .where(
            and(
              eq(s.gameItems.id, c.itemId),
              eq(s.gameItems.campaignId, campaignId),
            ),
          );
        if (!item) throw new NotFoundException('Item not found');
        const [current] = await tx
          .select()
          .from(s.inventory)
          .where(
            and(
              eq(s.inventory.characterId, c.characterId),
              eq(s.inventory.itemId, c.itemId),
            ),
          );
        const quantity = (current?.quantity ?? 0) + c.quantity;
        if (quantity > 10000)
          throw new ConflictException('Inventory capacity exceeded');
        await tx
          .insert(s.inventory)
          .values({
            campaignId,
            characterId: c.characterId,
            itemId: c.itemId,
            quantity,
          })
          .onConflictDoUpdate({
            target: [s.inventory.characterId, s.inventory.itemId],
            set: { quantity },
          });
        await emit({
          type: 'ITEM_ADDED',
          description: c.reason,
          participants: [c.characterId],
          changes: { itemId: c.itemId, quantity: c.quantity },
          visibility: item.visibility,
        });
        return { id: c.itemId };
      }
      case 'INVENTORY_ACTION':
        return this.applyInventory(c, env, audience, tx, emit);
      case 'METRIC_DEFINE': {
        if (c.minimum >= c.maximum)
          throw new BadRequestException('Invalid metric range');
        const [existing] = await tx
          .select()
          .from(s.relationshipMetrics)
          .where(
            and(
              eq(s.relationshipMetrics.campaignId, campaignId),
              eq(s.relationshipMetrics.name, c.name),
            ),
          );
        if (existing) throw new ConflictException('Metric already defined');
        await tx.insert(s.relationshipMetrics).values({
          campaignId,
          name: c.name,
          minimum: c.minimum,
          maximum: c.maximum,
        });
        const event = await emit({
          type: 'NARRATIVE_METRIC_DEFINED',
          description: 'Indicador narrativo SoloRPG registrado',
          changes: { name: c.name, minimum: c.minimum, maximum: c.maximum },
        });
        return { id: event.id };
      }
      case 'RELATIONSHIP_SET': {
        await character(c.fromCharacterId);
        await character(c.toCharacterId);
        if (c.fromCharacterId === c.toCharacterId)
          throw new BadRequestException(
            'Relationship requires distinct characters',
          );
        const [metric] = await tx
          .select()
          .from(s.relationshipMetrics)
          .where(
            and(
              eq(s.relationshipMetrics.campaignId, campaignId),
              eq(s.relationshipMetrics.name, c.metric),
            ),
          );
        if (!metric || c.value < metric.minimum || c.value > metric.maximum)
          throw new BadRequestException(
            'Value outside configured narrative metric',
          );
        const values = {
          campaignId,
          fromCharacterId: c.fromCharacterId,
          toCharacterId: c.toCharacterId,
          metric: c.metric,
          value: c.value,
          reason: c.reason,
          visibility: c.visibility,
        };
        await tx
          .insert(s.relationships)
          .values(values)
          .onConflictDoUpdate({
            target: [
              s.relationships.campaignId,
              s.relationships.fromCharacterId,
              s.relationships.toCharacterId,
              s.relationships.metric,
            ],
            set: { value: c.value, reason: c.reason, visibility: c.visibility },
          });
        const event = await emit({
          type: 'RELATIONSHIP_CHANGED',
          description: c.reason,
          participants: [c.fromCharacterId, c.toCharacterId],
          changes: {
            metric: c.metric,
            value: c.value,
            origin: 'SOLORPG_NARRATIVE_EXTENSION',
          },
          visibility: c.visibility,
        });
        return { id: event.id };
      }
      case 'WORLD_UPSERT': {
        const [existing] = await tx
          .select()
          .from(s.worldEntities)
          .where(eq(s.worldEntities.id, c.entityId));
        if (existing && existing.campaignId !== campaignId)
          throw new NotFoundException('World entity not found');
        const adventure = await loadAdventure(campaignId, tx);
        const managed =
          adventure &&
          this.adventures.forDefinition(adventure.definition).scenePolicy
            ? adventure.definition.locations.find(
                (loc) =>
                  adventureEntityId(
                    campaignId,
                    loc.key,
                    adventure.instance.entityNamespace,
                  ) === c.entityId,
              )
            : undefined;
        if (
          managed &&
          (!existing ||
            c.name !== existing.name ||
            c.kind !== existing.kind ||
            c.description !== existing.description ||
            c.visibility !== existing.visibility)
        )
          throw new BadRequestException(
            'Canonical location descriptions and disclosure require adventure confirmation',
          );
        const values = {
          kind: c.kind,
          name: c.name,
          description: c.description,
          status: c.status,
          accessible: c.accessible,
          privateNotes: c.privateNotes,
          visibility: c.visibility,
        };
        await tx
          .insert(s.worldEntities)
          .values({ id: c.entityId, campaignId, ...values })
          .onConflictDoUpdate({ target: s.worldEntities.id, set: values });
        await emit({
          type: 'LOCATION_UPDATED',
          description: c.reason,
          changes: {
            entityId: c.entityId,
            kind: c.kind,
            status: c.status,
            accessible: c.accessible,
          },
          visibility:
            managed || existing?.visibility === 'GM_ONLY'
              ? 'GM_ONLY'
              : c.visibility,
        });
        return { id: c.entityId };
      }
      case 'EVENT_RECORD': {
        if (
          (c.eventType === 'ADVENTURE_OBJECT_EXAMINED') !==
          !!c.objectEvidence
        )
          throw new BadRequestException(
            'Object examination requires scoped evidence',
          );
        if (c.storySpeaker && c.eventType !== 'NPC_REPLY_RECORDED')
          throw new BadRequestException(
            'Story attribution requires an NPC reply',
          );
        const event = await emit({
          type: c.eventType,
          description: c.description,
          participants: c.participants,
          changes: {
            origin: 'SOLORPG_NARRATIVE_EXTENSION',
            ...c.objectEvidence,
            ...(c.storySpeaker
              ? {
                  speaker: {
                    kind: c.storySpeaker.kind,
                    entityId: c.storySpeaker.entityId,
                  },
                }
              : {}),
          },
          visibility: c.visibility,
        });
        return { id: event.id };
      }
    }
  }
  private async persistRoll(
    result: {
      dice: [number, number, number];
      dramaDie: number;
      modifier: number;
      total: number;
      success: boolean | null;
      source?: 'PLAYER_DECLARED';
      stuntPoints: number;
    },
    env: CommandEnvelope,
    visibility: 'PUBLIC' | 'PLAYER_ONLY' | 'GM_ONLY',
    reason: string,
    tx: DatabaseTransaction,
    emit: (audit: Audit) => Promise<typeof s.gameEvents.$inferSelect>,
    characterId?: string,
    requestId?: string,
  ) {
    const { campaignId, sessionId } = env;
    const [last] =
      visibility === 'GM_ONLY'
        ? []
        : await tx
            .select({ value: max(s.diceRolls.publicSequence) })
            .from(s.diceRolls)
            .where(eq(s.diceRolls.campaignId, campaignId));
    const publicSequence =
      visibility === 'GM_ONLY' ? null : (last?.value ?? 0) + 1;
    const [row] = await tx
      .insert(s.diceRolls)
      .values({
        campaignId,
        sessionId: sessionId!,
        characterId,
        requestId,
        die1: result.dice[0],
        die2: result.dice[1],
        dramaDie: result.dramaDie,
        modifier: result.modifier,
        total: result.total,
        success: result.success,
        stuntPoints: result.stuntPoints,
        visibility,
        reason,
        publicSequence,
      })
      .returning();
    if (!row) throw new Error('Missing roll');
    const event = await emit({
      type: requestId ? 'ABILITY_CHECK' : 'DICE_ROLLED',
      description: reason,
      participants: characterId ? [characterId] : [],
      changes: { rollId: row.id, ...result, availableStuntPoints: 0 },
      visibility,
    });
    if (visibility === 'PUBLIC')
      await this.messages.insert(
        {
          campaignId,
          sessionId: sessionId!,
          role: 'SYSTEM',
          content: `${reason}${result.source === 'PLAYER_DECLARED' ? ' (dados declarados pela jogadora)' : ''}: [${result.dice.join(', ')}] · Drama Die ${result.dramaDie} · modificador ${result.modifier} · total ${result.total}${result.success === null ? '' : result.success ? ' · sucesso' : ' · falha'} · SP gerados ${result.stuntPoints}.`,
          sequenceNumber:
            (await this.messages.lastSequence(sessionId!, tx)) + 1,
          metadata: { rollId: row.id, eventId: event.id },
        },
        tx,
      );
    return { id: row.id };
  }
  private async applyInventory(
    c: Extract<EngineCommand, { type: 'INVENTORY_ACTION' }>,
    env: CommandEnvelope,
    audience: 'PLAYER' | 'INTERNAL',
    tx: DatabaseTransaction,
    emit: (audit: Audit) => Promise<typeof s.gameEvents.$inferSelect>,
  ) {
    const actor = await this.repository.character(
        env.campaignId,
        c.characterId,
        tx,
      ),
      input = c.input;
    if (audience === 'PLAYER' && actor.kind !== 'PROTAGONIST')
      throw new ForbiddenException();
    if (input.sessionId !== env.sessionId)
      throw new BadRequestException('Wrong inventory session');
    const [entry] = await tx
      .select({ inventory: s.inventory, item: s.gameItems })
      .from(s.inventory)
      .innerJoin(s.gameItems, eq(s.inventory.itemId, s.gameItems.id))
      .where(
        and(
          eq(s.inventory.characterId, actor.id),
          eq(s.inventory.itemId, input.itemId),
        ),
      );
    if (
      !entry ||
      (audience === 'PLAYER' && entry.item.visibility === 'GM_ONLY')
    )
      throw new NotFoundException('Inventory item not found');
    if (entry.inventory.quantity < input.quantity)
      throw new ConflictException('Insufficient quantity');
    const participants = [actor.id];
    if (input.action === 'EQUIP' || input.action === 'UNEQUIP') {
      if (input.quantity !== 1 || input.toCharacterId)
        throw new BadRequestException(
          'Equipment action accepts one item and no recipient',
        );
      await tx
        .update(s.inventory)
        .set({ equipped: input.action === 'EQUIP' })
        .where(
          and(
            eq(s.inventory.characterId, actor.id),
            eq(s.inventory.itemId, input.itemId),
          ),
        );
    } else {
      if (
        input.action === 'CONSUME' &&
        (!entry.item.consumable || input.toCharacterId)
      )
        throw new BadRequestException(
          'Item cannot be consumed or recipient is invalid',
        );
      if (input.action === 'TRANSFER') {
        if (!input.toCharacterId || input.toCharacterId === actor.id)
          throw new BadRequestException('Distinct recipient required');
        const recipient = await this.repository.character(
          env.campaignId,
          input.toCharacterId,
          tx,
        );
        if (audience === 'PLAYER' && !recipient.known)
          throw new NotFoundException('Recipient not found');
        participants.push(recipient.id);
        const [destination] = await tx
          .select()
          .from(s.inventory)
          .where(
            and(
              eq(s.inventory.characterId, recipient.id),
              eq(s.inventory.itemId, input.itemId),
            ),
          );
        const quantity = (destination?.quantity ?? 0) + input.quantity;
        if (quantity > 10000)
          throw new ConflictException('Inventory capacity exceeded');
        await tx
          .insert(s.inventory)
          .values({
            campaignId: env.campaignId,
            characterId: recipient.id,
            itemId: input.itemId,
            quantity,
          })
          .onConflictDoUpdate({
            target: [s.inventory.characterId, s.inventory.itemId],
            set: { quantity },
          });
      }
      const quantity = entry.inventory.quantity - input.quantity;
      await tx
        .update(s.inventory)
        .set({ quantity, equipped: quantity > 0 && entry.inventory.equipped })
        .where(
          and(
            eq(s.inventory.characterId, actor.id),
            eq(s.inventory.itemId, input.itemId),
          ),
        );
    }
    await emit({
      type:
        input.action === 'TRANSFER'
          ? 'ITEM_TRANSFERRED'
          : input.action === 'CONSUME'
            ? 'ITEM_REMOVED'
            : 'EQUIPMENT_CHANGED',
      description: `Inventário: ${input.action}`,
      participants,
      changes: {
        itemId: input.itemId,
        quantity: input.quantity,
        action: input.action,
      },
      visibility: entry.item.visibility,
    });
    return { id: input.itemId };
  }
}
