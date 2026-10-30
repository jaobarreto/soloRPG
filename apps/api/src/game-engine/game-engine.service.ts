import { BlueRoseTestsService } from '../blue-rose/tests.service';
import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, max } from 'drizzle-orm';
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
  type CreateCharacter,
} from '@solo-rpg/shared-contracts';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service';
import * as s from '../database/game-schema';
import { CampaignsRepository } from '../campaigns/campaigns.repository';
import { SessionsRepository } from '../sessions/sessions.repository';
import { MessagesRepository } from '../messages/messages.repository';
import { BlueRoseDice, resolveBasicCheck } from '../blue-rose/blue-rose.rules';
import { GameRepository } from './game.repository';
import {
  commandEnvelopeSchema,
  type CommandEnvelope,
  type EngineCommand,
} from './commands';
import { parseInput } from './validation';

import type { Audit, GameContext } from './context';
import { BlueRoseCombatService } from '../blue-rose/combat.service';
import { BlueRoseArcanaService } from '../blue-rose/arcana.service';
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
    private readonly tests: BlueRoseTestsService,
  ) {}

  // Only the local CLI and server code receive this capability. No HTTP route dispatches internal commands.
  async executeInternal(input: unknown) {
    return this.execute(parseInput(commandEnvelopeSchema, input), 'INTERNAL');
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
    const { campaignId, sessionId, commandId, command } = envelope;
    const digest = createHash('sha256')
      .update(JSON.stringify({ audience, ...envelope }))
      .digest('hex');
    return this.database.db.transaction(async (tx) => {
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
      if (campaign.status === 'COMPLETED')
        throw new ConflictException('Campaign is completed');
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
      const emit = async (audit: Audit) => {
        let visibility = audit.visibility ?? 'PUBLIC';
        const participants = [...new Set(audit.participants ?? [])];
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
    });
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
    const context: GameContext = {
      ...env,
      audience,
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
      case 'OPPOSED_PREPARE':
      case 'ADVANCED_CREATE':
      case 'ADVANCED_PREPARE':
      case 'SPECIAL_CHECK_RESOLVE':
        return this.tests.apply(c, context);
      case 'COMBAT_CONFIGURE':
      case 'COMBAT_START':
      case 'COMBAT_END':
      case 'COMBAT_ACTION':
      case 'COMBAT_RESOLVE':
        return this.combat.apply(c, context);
      case 'ARCANA_CURE_PREPARE':
      case 'ARCANA_CURE_RESOLVE':
      case 'REST':
        return this.arcana.apply(c, context);

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
        await this.validateFeatures(sheet, tx);
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
            existing?.visibility === 'GM_ONLY' ? 'GM_ONLY' : c.visibility,
        });
        return { id: c.entityId };
      }
      case 'EVENT_RECORD': {
        const event = await emit({
          type: c.eventType,
          description: c.description,
          participants: c.participants,
          changes: { origin: 'SOLORPG_NARRATIVE_EXTENSION' },
          visibility: c.visibility,
        });
        return { id: event.id };
      }
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
        await emit({
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
        return this.persistRoll(
          { ...roll, ...result },
          env,
          check.visibility,
          check.reason,
          tx,
          emit,
          actor.id,
          check.id,
        );
      }
      case 'ROLL':
        return this.persistRoll(
          { ...this.dice.roll(), success: null, stuntPoints: 0 },
          env,
          'PUBLIC',
          'Rolagem livre de 3d6',
          tx,
          emit,
        );
    }
  }
  private async validateFeatures(
    sheet: CreateCharacter,
    tx: DatabaseTransaction,
  ) {
    if (
      new Set(sheet.features.map((f) => f.ruleId)).size !==
      sheet.features.length
    )
      throw new BadRequestException('Duplicate features');
    for (const feature of sheet.features) {
      const [rule] = await tx
        .select()
        .from(s.ruleReferences)
        .where(eq(s.ruleReferences.id, feature.ruleId));
      if (feature.improved && (sheet.level < 11 || rule?.kind !== 'FOCUS'))
        throw new BadRequestException(
          'Improved focuses require level 11 and a focus',
        );
      if (!rule || rule.status === 'PENDING' || rule.kind === 'STUNT')
        throw new BadRequestException('Rule is unavailable');
      if (
        (rule.kind === 'TALENT' || rule.kind === 'SPECIALIZATION') !==
        !!feature.degree
      )
        throw new BadRequestException(
          'Talent/specialization requires a degree; focuses and arcana do not accept degrees',
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
  private async persistRoll(
    result: {
      dice: [number, number, number];
      dramaDie: number;
      modifier: number;
      total: number;
      success: boolean | null;
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
          content: `${reason}: [${result.dice.join(', ')}] · Drama Die ${result.dramaDie} · modificador ${result.modifier} · total ${result.total}${result.success === null ? '' : result.success ? ' · sucesso' : ' · falha'} · SP gerados ${result.stuntPoints}.`,
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
