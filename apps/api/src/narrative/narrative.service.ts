import {
  objectIntent,
  pinnedSceneObjects,
} from '../adventures/core/objects/scene-objects';
import {
  batchInputSchema,
  declaredDice,
  normalizeIntent,
  queuedBatchSchema,
  queuedInputSchema,
  travelPending,
} from './queued-interaction';
import { adventureContext } from '../adventures/core/scenes/scene-state';
import { publicMounts } from '../blue-rose/mechanics/mounts';
import { publishNarration } from './publication';
import {
  authorizedMentions,
  filterMentions,
  storedMentions,
  validateMentions,
} from './mentions';
import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  narrativeInputSchema,
  narrativeProposalSchema,
  narrationSchema,
  publicActionSchema,
  turnResponseSchema,
  type PublicNarrativeAction,
  type MechanicalAction,
} from '@solo-rpg/shared-contracts';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service';
import { CampaignsRepository } from '../campaigns/campaigns.repository';
import { SessionsRepository } from '../sessions/sessions.repository';
import { SessionsService } from '../sessions/sessions.service';
import { MessagesRepository } from '../messages/messages.repository';
import { sessionMessages, type MessageRecord } from '../database/schema';
import * as n from '../database/narrative-schema';
import * as g from '../database/game-schema';
import * as arcana from '../database/arcana-schema';
import {
  adventureEntityId,
  loadAdventure,
} from '../adventures/core/state/state';
import { AdventureRegistry } from '../adventures/core/registry/registry';
import { AiServiceClient } from '../integrations/ai-service/ai-service.client';
import { parseInput } from '../game-engine/validation';
import { NarrativeContextService } from './context.service';
import { NarrativeResolutionService } from './resolution.service';
import {
  validateRendering,
  dialogueProvenance,
  modelRendering,
} from './rendering';

@Injectable()
export class NarrativeService {
  constructor(
    private readonly database: DatabaseService,
    private readonly campaigns: CampaignsRepository,
    private readonly sessions: SessionsRepository,
    private readonly lifecycle: SessionsService,
    private readonly messages: MessagesRepository,
    private readonly ai: AiServiceClient,
    private readonly context: NarrativeContextService,
    private readonly resolution: NarrativeResolutionService,
    private readonly config: ConfigService,
    private readonly adventures: AdventureRegistry,
  ) {}
  private async locked(
    campaignId: string,
    sessionId: string,
    tx: DatabaseTransaction,
  ) {
    if (!(await this.campaigns.lock(campaignId, tx)))
      throw new NotFoundException('Campaign not found');
    const session = await this.sessions.lock(campaignId, sessionId, tx);
    if (!session) throw new NotFoundException('Session not found in campaign');
    return session;
  }
  private async action(
    campaignId: string,
    sessionId: string,
    id: string,
    tx: DatabaseService['db'] | DatabaseTransaction = this.database.db,
  ) {
    const [action] = await tx
      .select()
      .from(n.narrativeActions)
      .where(
        and(
          eq(n.narrativeActions.id, id),
          eq(n.narrativeActions.campaignId, campaignId),
          eq(n.narrativeActions.sessionId, sessionId),
        ),
      );
    if (!action) throw new NotFoundException('Action not found');
    return action;
  }
  async create(campaignId: string, sessionId: string, raw: unknown) {
    const input = parseInput(narrativeInputSchema, raw);
    if (
      input.content.length >
      this.config.getOrThrow<number>('MESSAGE_MAX_LENGTH')
    )
      throw new BadRequestException('Message too long');
    const digest = createHash('sha256')
      .update(JSON.stringify({ campaignId, sessionId, ...input }))
      .digest('hex');
    await this.database.db.transaction(async (tx) => {
      const session = await this.locked(campaignId, sessionId, tx);
      const [existing] = await tx
        .select()
        .from(n.narrativeActions)
        .where(eq(n.narrativeActions.id, input.actionId));
      if (existing) {
        if (existing.digest !== digest)
          throw new ConflictException(
            'Action key already used with different input',
          );
        return;
      }
      if (session.status !== 'IN_PROGRESS')
        throw new ConflictException('Session must be in progress');
      const [queued] = await tx
        .select({ id: sessionMessages.id })
        .from(sessionMessages)
        .where(
          and(
            eq(sessionMessages.sessionId, sessionId),
            sql`${sessionMessages.metadata}->>'queued' = 'true'`,
          ),
        )
        .limit(1);
      if (queued)
        throw new ConflictException(
          'Use Continuar para processar as mensagens já enviadas.',
        );
      const [pending] = await tx
        .select()
        .from(n.narrativeActions)
        .where(
          and(
            eq(n.narrativeActions.campaignId, campaignId),
            sql`${n.narrativeActions.status} NOT IN ('COMPLETED','REJECTED')`,
          ),
        );
      if (pending)
        throw new ConflictException(
          'Resolve the pending narrative action first',
        );
      const route = (await this.adventures.guidedRelease(campaignId, tx))
        ?.directRoute;
      if (route && input.optionId) {
        const loaded = await loadAdventure(campaignId, tx);
        if (
          loaded &&
          input.optionId ===
            adventureEntityId(
              campaignId,
              `option-${route.sceneKey}-${route.optionKey}`,
              loaded.instance.entityNamespace,
            )
        ) {
          if (
            input.interactionMode !== 'ACT' ||
            input.content.trim() !== route.playerText
          )
            throw new BadRequestException(
              'Envie a confirmação exibida para registrar essa escolha.',
            );
          const [prepared] = await tx
            .select()
            .from(n.sessionPlans)
            .where(eq(n.sessionPlans.sessionId, sessionId));
          const option = prepared?.plan.options.find(
            (entry) => entry.id === input.optionId,
          );
          const done = await this.context.completedOptions(
            campaignId,
            sessionId,
            tx,
          );
          if (
            !option ||
            done.includes(option.id) ||
            option.requiresOptionIds.some((id) => !done.includes(id))
          )
            throw new ConflictException(
              'A rota só está disponível depois do contato confirmado na estrada.',
            );
        }
      }
      await validateMentions(
        campaignId,
        sessionId,
        input.content,
        input.mentions ?? [],
        tx,
        this.adventures,
      );
      if (['SPEAK', 'ACT'].includes(input.interactionMode))
        await this.revealTravel(campaignId, sessionId, tx);
      const message = await this.messages.insert(
        {
          campaignId,
          sessionId,
          role: 'PLAYER',
          interactionMode: input.interactionMode,
          content: input.content,
          sequenceNumber: (await this.messages.lastSequence(sessionId, tx)) + 1,
          metadata: {
            mentions: input.mentions ?? [],
            actionId: input.actionId,
            selectedOptionId: input.optionId ?? null,
            selectedMechanic: input.mechanic ?? null,
          },
        },
        tx,
      );
      await tx.insert(n.narrativeActions).values({
        id: input.actionId,
        campaignId,
        sessionId,
        digest,
        playerMessageId: message.id,
      });
    });
    return this.retry(campaignId, sessionId, input.actionId);
  }
  async enqueue(campaignId: string, sessionId: string, raw: unknown) {
    const input = parseInput(queuedInputSchema, raw);
    if (
      input.content.length >
      this.config.getOrThrow<number>('MESSAGE_MAX_LENGTH')
    )
      throw new BadRequestException('Mensagem longa demais.');
    return this.database.db.transaction(async (tx) => {
      const session = await this.locked(campaignId, sessionId, tx);
      const [existing] = await tx
        .select()
        .from(sessionMessages)
        .where(eq(sessionMessages.id, input.id));
      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ campaignId, sessionId, ...input }))
        .digest('hex');
      if (existing) {
        if (existing.metadata?.queueDigest !== fingerprint)
          throw new ConflictException('Este identificador já foi usado.');
        return { id: existing.id };
      }
      if (session.status !== 'IN_PROGRESS')
        throw new ConflictException('Retome a sessão antes de enviar.');
      const [size] = await tx
        .select({
          count: sql<number>`count(*)::int`,
          length: sql<number>`coalesce(sum(length(${sessionMessages.content})), 0)::int`,
        })
        .from(sessionMessages)
        .where(
          and(
            eq(sessionMessages.sessionId, sessionId),
            sql`${sessionMessages.metadata}->>'queued' = 'true'`,
          ),
        );
      if (
        (size?.count ?? 0) >= 12 ||
        (size?.length ?? 0) + input.content.length > 18000
      )
        throw new BadRequestException(
          'O lote atual está cheio. Processe as mensagens já enviadas antes de adicionar outra.',
        );
      await validateMentions(
        campaignId,
        sessionId,
        input.content,
        input.mentions ?? [],
        tx,
        this.adventures,
      );
      await this.messages.insert(
        {
          id: input.id,
          campaignId,
          sessionId,
          role: 'PLAYER',
          interactionMode: input.interactionMode,
          content: input.content,
          sequenceNumber: (await this.messages.lastSequence(sessionId, tx)) + 1,
          metadata: {
            queued: true,
            queueDigest: fingerprint,
            mentions: input.mentions ?? [],
          },
        },
        tx,
      );
      return { id: input.id };
    });
  }

  async continueBatch(campaignId: string, sessionId: string, raw: unknown) {
    const { id } = parseInput(batchInputSchema, raw);
    const token = randomUUID();
    const batch = await this.database.db.transaction(async (tx) => {
      const session = await this.locked(campaignId, sessionId, tx);
      const prior = await this.batchReceipt(campaignId, id, tx);
      if (prior && (!prior.result || prior.result.sessionId !== sessionId))
        throw new ConflictException('Este identificador já foi usado.');
      const canonical = prior?.result?.canonicalId
        ? await this.batchReceipt(campaignId, prior.result.canonicalId, tx)
        : prior;
      // Legacy receipts already published their own messages. Replays never
      // reinterpret their old snapshot as a new A.1.3.1 publication.
      if (
        canonical &&
        (canonical.digest !== 'narrative-batch-v2' || canonical.result?.sealed)
      )
        return null;
      if (session.status !== 'IN_PROGRESS')
        throw new ConflictException('Retome a sessão antes de continuar.');
      const [open] = canonical
        ? [canonical]
        : await tx
            .select({
              id: g.gameCommands.commandId,
              result: g.gameCommands.result,
            })
            .from(g.gameCommands)
            .where(
              and(
                eq(g.gameCommands.campaignId, campaignId),
                eq(g.gameCommands.digest, 'narrative-batch-v2'),
                sql`${g.gameCommands.result}->>'sessionId' = ${sessionId}`,
                sql`${g.gameCommands.result}->>'sealed' = 'false'`,
              ),
            )
            .limit(1);
      if (open) {
        const result = queuedBatchSchema.parse(open.result);
        if (!prior && open.id !== id)
          await tx.insert(g.gameCommands).values({
            campaignId,
            commandId: id,
            digest: 'narrative-batch-alias-v2',
            result: { sessionId, messages: [], canonicalId: open.id },
          });
        if ((result.leaseUntil ?? 0) > Date.now()) return null;
        await this.writeBatch(
          campaignId,
          open.id,
          {
            ...result,
            leaseToken: token,
            leaseUntil: Date.now() + 90_000,
          },
          tx,
        );
        return { id: open.id, messages: result.messages };
      }
      const pending = await tx
        .select()
        .from(sessionMessages)
        .where(
          and(
            eq(sessionMessages.sessionId, sessionId),
            sql`${sessionMessages.metadata}->>'queued' = 'true'`,
          ),
        )
        .orderBy(sessionMessages.sequenceNumber)
        .limit(13);
      const [active] = await this.activeAction(campaignId, tx);
      if (active && active.sessionId !== sessionId)
        throw new ConflictException('Resolva a pendência da sessão ativa.');
      if (
        pending.length > 12 ||
        pending.reduce((sum, message) => sum + message.content.length, 0) >
          18000
      )
        throw new BadRequestException(
          'O lote excede o limite. Continue enviando um lote menor após dividir as mensagens pendentes.',
        );
      const result = {
        sessionId,
        messages: pending.map((message) => message.id),
        sealed: !pending.length,
        leaseToken: token,
        leaseUntil: Date.now() + 90_000,
      };
      if (
        !pending.length &&
        !active &&
        !(await this.hasPendingCheck(campaignId, sessionId, tx))
      )
        await this.publishPause(campaignId, sessionId, tx);
      await tx.insert(g.gameCommands).values({
        campaignId,
        commandId: id,
        digest: 'narrative-batch-v2',
        result,
      });
      return { id, messages: result.messages };
    });

    if (!batch?.messages.length)
      return { id, ...(await this.state(campaignId, sessionId)) };
    let canPublish = true;
    try {
      for (let index = 0; index < batch.messages.length; index++) {
        const messageId = batch.messages[index]!;
        const next = await this.database.db.transaction(async (tx) => {
          const session = await this.locked(campaignId, sessionId, tx);
          const batchState = await this.batchReceipt(campaignId, batch.id, tx);
          if (batchState?.result?.leaseToken !== token)
            return { superseded: true } as const;
          if (session.status !== 'IN_PROGRESS')
            return { blocked: true } as const;
          await this.writeBatch(
            campaignId,
            batch.id,
            {
              ...batchState.result,
              leaseUntil: Date.now() + 90_000,
            },
            tx,
          );
          const [message] = await tx
            .select()
            .from(sessionMessages)
            .where(eq(sessionMessages.id, messageId));
          const [active] = await this.activeAction(campaignId, tx);
          if (
            active?.sessionId === sessionId &&
            active.status === 'COMMITTED' &&
            (active.id !== messageId || message?.metadata?.queued !== true)
          ) {
            const [player] = await tx
              .select()
              .from(sessionMessages)
              .where(eq(sessionMessages.id, active.playerMessageId));
            // A roll declaration can be acknowledged before its NARRATE call
            // fails. Recover that action even if the snapshot has no queued rows.
            if (
              player &&
              (player.metadata?.narrativeBatch === batch.id ||
                message?.metadata?.queued === true)
            ) {
              if (player.metadata?.narrativeBatch !== batch.id)
                await this.assignBatch(player, batch.id, tx);
              return { actionId: active.id, resumeHead: true } as const;
            }
          }
          if (!message || message.metadata?.queued !== true) return null;
          const [first] = await tx
            .select({ id: sessionMessages.id })
            .from(sessionMessages)
            .where(
              and(
                eq(sessionMessages.sessionId, sessionId),
                sql`${sessionMessages.metadata}->>'queued' = 'true'`,
              ),
            )
            .orderBy(sessionMessages.sequenceNumber)
            .limit(1);
          if (first?.id !== messageId) return { blocked: true } as const;
          if (active && active.id !== messageId) {
            if (active.sessionId !== sessionId)
              return { blocked: true } as const;
            if (active.status !== 'AWAITING_ROLL')
              return { blocked: true } as const;
            // A declaration answers the older pending test. It does not reorder independent turns.
            const [declaration] = await tx
              .select()
              .from(sessionMessages)
              .where(
                and(
                  inArray(sessionMessages.id, batch.messages),
                  eq(sessionMessages.sessionId, sessionId),
                  eq(sessionMessages.interactionMode, 'ROLL_RESULT'),
                  sql`${sessionMessages.metadata}->>'queued' = 'true'`,
                ),
              )
              .orderBy(sessionMessages.sequenceNumber)
              .limit(1);
            if (!declaration) return { blocked: true } as const;
            const dice = declaredDice(declaration.content);
            if (!dice || active.proposal?.kind !== 'SCENE') {
              await this.markProcessed(declaration, tx);
              await this.publishNote(
                campaignId,
                sessionId,
                'Para um teste básico pendente, informe os dois dados comuns e depois o Dado de Drama, por exemplo: 4, 4 e 2. Outros testes conservam seu procedimento próprio.',
                { clarification: true, batchFragment: batch.id },
                tx,
              );
              return { blocked: true } as const;
            }
            const [player] = await tx
              .select()
              .from(sessionMessages)
              .where(eq(sessionMessages.id, active.playerMessageId));
            if (player) await this.assignBatch(player, batch.id, tx);
            await this.resolution.roll(active, tx, dice);
            await this.markProcessed(declaration, tx);
            return { actionId: active.id, resumeHead: true } as const;
          }
          const [receipt] = await tx
            .select()
            .from(n.narrativeActions)
            .where(eq(n.narrativeActions.id, messageId));
          if (
            receipt &&
            ['COMPLETED', 'REJECTED', 'AWAITING_ROLL'].includes(receipt.status)
          ) {
            await this.markProcessed(message, tx);
            return null;
          }
          if (message.interactionMode === 'THINK' && !active && !receipt) {
            // The diary retains the player's words. They never enter a model,
            // a character's knowledge, or the world-event pipeline.
            await this.markProcessed(message, tx);
            return null;
          }
          if (!active) {
            if (
              ['SPEAK', 'ACT'].includes(message.interactionMode!) &&
              !(
                objectIntent(message.interactionMode, message.content) &&
                (await pinnedSceneObjects(campaignId, tx, this.adventures))
              )
            )
              await this.revealTravel(campaignId, sessionId, tx, batch.id);
            const selectedOptionId = await this.queuedOption(message, tx);
            await tx
              .update(sessionMessages)
              .set({
                metadata: {
                  ...message.metadata,
                  actionId: message.id,
                  narrativeBatch: batch.id,
                  selectedOptionId,
                },
              })
              .where(eq(sessionMessages.id, message.id));
            await tx
              .insert(n.narrativeActions)
              .values({
                id: message.id,
                campaignId,
                sessionId,
                digest: String(message.metadata.queueDigest),
                playerMessageId: message.id,
              })
              .onConflictDoNothing();
          }
          return { actionId: message.id } as const;
        });
        if (!next) continue;
        if ('superseded' in next) {
          canPublish = false;
          break;
        }
        if ('blocked' in next) break;
        const result = await this.retry(campaignId, sessionId, next.actionId);
        if (['PENDING', 'COMMITTED'].includes(result.status)) {
          canPublish = false;
          break;
        }
        if (result.status === 'AWAITING_STUNTS') break;
        if ('resumeHead' in next) {
          if (result.status === 'AWAITING_ROLL') break;
          index--;
          continue;
        }
        await this.database.db.transaction(async (tx) => {
          await this.locked(campaignId, sessionId, tx);
          const [message] = await tx
            .select()
            .from(sessionMessages)
            .where(eq(sessionMessages.id, messageId));
          if (message?.metadata?.queued === true)
            await this.markProcessed(message, tx);
        });
      }
    } catch (error) {
      canPublish = false;
      throw error;
    } finally {
      await this.finishBatch(
        campaignId,
        sessionId,
        batch.id,
        token,
        canPublish,
      );
    }
    return { id, ...(await this.state(campaignId, sessionId)) };
  }

  private async batchReceipt(
    campaignId: string,
    id: string,
    tx: DatabaseTransaction,
  ) {
    const [row] = await tx
      .select({
        id: g.gameCommands.commandId,
        digest: g.gameCommands.digest,
        result: g.gameCommands.result,
      })
      .from(g.gameCommands)
      .where(
        and(
          eq(g.gameCommands.campaignId, campaignId),
          eq(g.gameCommands.commandId, id),
        ),
      );
    if (!row) return undefined;
    const parsed = queuedBatchSchema.safeParse(row.result);
    return { ...row, result: parsed.success ? parsed.data : null };
  }

  private writeBatch(
    campaignId: string,
    id: string,
    result: typeof queuedBatchSchema._output,
    tx: DatabaseTransaction,
  ) {
    return tx
      .update(g.gameCommands)
      .set({ result })
      .where(
        and(
          eq(g.gameCommands.campaignId, campaignId),
          eq(g.gameCommands.commandId, id),
        ),
      );
  }

  private assignBatch(
    message: MessageRecord,
    id: string,
    tx: DatabaseTransaction,
  ) {
    return tx
      .update(sessionMessages)
      .set({
        metadata: { ...message.metadata, narrativeBatch: id },
      })
      .where(eq(sessionMessages.id, message.id));
  }

  private async batchFragment(message: MessageRecord, tx: DatabaseTransaction) {
    const id = message.metadata?.narrativeBatch;
    if (typeof id !== 'string') return {};
    const batch = await this.batchReceipt(message.campaignId, id, tx);
    return batch?.result?.sealed === false ? { batchFragment: id } : {};
  }

  private async finishBatch(
    campaignId: string,
    sessionId: string,
    id: string,
    token: string,
    publish: boolean,
  ) {
    await this.database.db.transaction(async (tx) => {
      if (!(await this.campaigns.lock(campaignId, tx))) return;
      const session = await this.sessions.lock(campaignId, sessionId, tx);
      const batch = await this.batchReceipt(campaignId, id, tx);
      if (!session || batch?.result?.leaseToken !== token) return;
      if (publish) {
        const fragments = await tx
          .select()
          .from(sessionMessages)
          .where(
            and(
              eq(sessionMessages.sessionId, sessionId),
              sql`${sessionMessages.metadata}->>'batchFragment' = ${id}`,
            ),
          )
          .orderBy(sessionMessages.sequenceNumber);
        // Keep the original, separately validated receipts for action and event
        // provenance. The diary gets a single projection of those fragments.
        if (fragments.length) {
          const clarification = fragments.every(
            (row) => row.metadata?.clarification,
          );
          const mixed =
            !clarification &&
            fragments.some((row) => row.metadata?.clarification);
          const narrative = fragments
            .map((row) =>
              mixed && row.metadata?.clarification
                ? `Esclarecimento de Una: ${row.content}`
                : row.content,
            )
            .join('\n\n');
          const eventIds = [
            ...new Set(
              fragments.flatMap((row) =>
                Array.isArray(row.metadata?.eventIds)
                  ? row.metadata.eventIds.filter(
                      (entry): entry is string => typeof entry === 'string',
                    )
                  : [],
              ),
            ),
          ];
          await publishNarration(
            this.messages,
            tx,
            { campaignId, sessionId },
            { narrative, eventIds },
            {
              batchContinuation: true,
              ...(fragments.some((row) => row.metadata?.travelRevealed === true)
                ? { travelRevealed: true }
                : {}),
              ...(clarification ? { clarification } : {}),
            },
          );
        }
      }
      await this.writeBatch(
        campaignId,
        id,
        {
          sessionId,
          messages: batch.result.messages,
          sealed: publish,
        },
        tx,
      );
    });
  }

  private async hasPendingCheck(
    campaignId: string,
    sessionId: string,
    tx: DatabaseTransaction,
  ) {
    for (const table of [
      g.checkRequests,
      g.specialCheckRequests,
      g.arcanaRequests,
    ]) {
      const [check] = await tx
        .select({ id: table.id })
        .from(table)
        .where(
          and(
            eq(table.campaignId, campaignId),
            eq(table.sessionId, sessionId),
            eq(table.resolved, false),
          ),
        )
        .limit(1);
      if (check) return true;
    }
    return false;
  }

  private activeAction(campaignId: string, tx: DatabaseTransaction) {
    return tx
      .select()
      .from(n.narrativeActions)
      .where(
        and(
          eq(n.narrativeActions.campaignId, campaignId),
          sql`${n.narrativeActions.status} NOT IN ('COMPLETED','REJECTED')`,
        ),
      )
      .limit(1);
  }

  private markProcessed(
    message: typeof sessionMessages.$inferSelect,
    tx: DatabaseTransaction,
  ) {
    return tx
      .update(sessionMessages)
      .set({ metadata: { ...message.metadata, queued: false } })
      .where(eq(sessionMessages.id, message.id));
  }

  private async queuedOption(
    message: typeof sessionMessages.$inferSelect,
    tx: DatabaseTransaction,
  ) {
    if (
      !['ACT', 'SPEAK', 'REQUEST_CHECK'].includes(message.interactionMode!) ||
      storedMentions(message.metadata).length
    )
      return null;
    if (await travelPending(message.sessionId, tx)) return null;
    const [prepared] = await tx
      .select()
      .from(n.sessionPlans)
      .where(eq(n.sessionPlans.sessionId, message.sessionId));
    const done = await this.context.completedOptions(
      message.campaignId,
      message.sessionId,
      tx,
    );
    const release = await this.adventures.guidedRelease(message.campaignId, tx);
    const text = normalizeIntent(message.content);
    const matches = (prepared?.plan.options ?? []).filter(
      (option) =>
        option.mode ===
          (message.interactionMode === 'REQUEST_CHECK'
            ? 'ACT'
            : message.interactionMode) &&
        (message.interactionMode !== 'REQUEST_CHECK' ||
          (option.check && !option.check.secret)) &&
        !done.includes(option.id) &&
        option.requiresOptionIds.every((id) => done.includes(id)) &&
        (release?.directRoute?.intent === option.intent
          ? message.content.trim() === release.directRoute.playerText
          : [
              option.intent,
              ...(release?.interactionPhrases?.[option.intent] ?? []),
            ].some((phrase) => normalizeIntent(phrase) === text)),
    );
    return matches.length === 1 ? matches[0]!.id : null;
  }

  private async publishNote(
    campaignId: string,
    sessionId: string,
    narrative: string,
    metadata: Record<string, unknown>,
    tx: DatabaseTransaction,
    eventIds: string[] = [],
  ) {
    const confirmed = { narrative, eventIds };
    const validation = validateRendering(confirmed, confirmed, {
      category: 'OBSERVE',
      protagonist: null,
      speaker: null,
      scene: null,
      facts: [],
      rules: [],
    });
    if (!validation.accepted)
      throw new ConflictException('A publicação não foi autorizada.');
    return publishNarration(
      this.messages,
      tx,
      { campaignId, sessionId },
      validation.narration,
      metadata,
    );
  }

  private async revealTravel(
    campaignId: string,
    sessionId: string,
    tx: DatabaseTransaction,
    batchId?: string,
  ) {
    const release = await this.adventures.guidedRelease(campaignId, tx);
    if (release?.opening.source !== 'APPROVED_TEXT') return false;
    const [opening] = await tx
      .select()
      .from(sessionMessages)
      .where(
        and(
          eq(sessionMessages.sessionId, sessionId),
          eq(sessionMessages.sequenceNumber, 1),
        ),
      );
    if (opening?.metadata?.openingRevision !== release.opening.revision)
      return false;
    const [reveal] = await tx
      .select({ id: sessionMessages.id })
      .from(sessionMessages)
      .where(
        and(
          eq(sessionMessages.sessionId, sessionId),
          sql`${sessionMessages.metadata}->>'travelRevealed' = 'true'`,
        ),
      );
    if (reveal) return false;
    const { context } = await adventureContext(
      campaignId,
      sessionId,
      tx,
      this.adventures,
    );
    if (!context?.publicOpening) return false;
    await this.publishNote(
      campaignId,
      sessionId,
      context.publicOpening,
      { travelRevealed: true, ...(batchId ? { batchFragment: batchId } : {}) },
      tx,
    );
    return true;
  }

  private async publishPause(
    campaignId: string,
    sessionId: string,
    tx: DatabaseTransaction,
  ) {
    if (await this.revealTravel(campaignId, sessionId, tx)) return;
    const [last] = await tx
      .select()
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, sessionId))
      .orderBy(desc(sessionMessages.sequenceNumber))
      .limit(1);
    if (!last?.metadata?.idleContinuation && !last?.metadata?.travelRevealed)
      await this.publishNote(
        campaignId,
        sessionId,
        'A cena permanece como está. Una aguarda sua próxima decisão.',
        { idleContinuation: true },
        tx,
      );
  }

  async get(campaignId: string, sessionId: string, id: string) {
    const action = await this.action(campaignId, sessionId, id);
    let pendingRoll = null;
    if (action.status === 'AWAITING_ROLL' && action.requestId) {
      if (action.proposal?.kind === 'MECHANIC') {
        const command = action.proposal.command;
        const ability =
          command.type === 'ADVENTURE_ACTION' &&
          command.input.action === 'RITUAL_ATTEMPT'
            ? command.input.task === 'CANDLES'
              ? 'CONSTITUTION'
              : command.input.task === 'POEM'
                ? 'WILLPOWER'
                : 'INTELLIGENCE'
            : command.type === 'CURE'
              ? 'INTELLIGENCE'
              : command.type === 'ARCANA_USE' &&
                  command.input.arcanum === 'body-control'
                ? command.input.tradition === 'MEDITATIVE'
                  ? 'WILLPOWER'
                  : 'PERCEPTION'
                : command.type === 'ARCANA_USE' &&
                    command.input.arcanum === 'psychic-contact'
                  ? 'COMMUNICATION'
                  : 'INTELLIGENCE';
        pendingRoll = { requestId: action.requestId, ability };
      }
      const [request] = await this.database.db
        .select()
        .from(g.checkRequests)
        .where(
          and(
            eq(g.checkRequests.id, action.requestId),
            inArray(g.checkRequests.visibility, ['PUBLIC', 'PLAYER_ONLY']),
          ),
        );
      if (request)
        pendingRoll = { requestId: request.id, ability: request.ability };
    }
    return publicActionSchema.parse({
      id: action.id,
      status: action.status,
      playerMessageId: action.playerMessageId,
      masterMessageId: action.masterMessageId,
      pendingRoll,
      error: action.error,
      retryable: ['PENDING', 'COMMITTED'].includes(action.status),
    });
  }
  async retry(
    campaignId: string,
    sessionId: string,
    id: string,
  ): Promise<PublicNarrativeAction> {
    const lease = await this.database.db.transaction(async (tx) => {
      const session = await this.locked(campaignId, sessionId, tx);
      const action = await this.action(campaignId, sessionId, id, tx);
      if (
        !['PENDING', 'COMMITTED'].includes(action.status) ||
        (action.leaseUntil && action.leaseUntil.getTime() > Date.now())
      )
        return null;
      if (session.status !== 'IN_PROGRESS')
        throw new ConflictException('Resume this session before retrying');
      const token = randomUUID();
      const revision = await this.context.revision(campaignId, sessionId, tx);
      await tx
        .update(n.narrativeActions)
        .set({
          leaseToken: token,
          leaseUntil: new Date(Date.now() + 90000),
          revision,
          error: null,
        })
        .where(eq(n.narrativeActions.id, id));
      const [message] = await tx
        .select()
        .from(sessionMessages)
        .where(eq(sessionMessages.id, action.playerMessageId));
      if (!message) throw new ConflictException('Missing player message');
      if (action.status === 'PENDING')
        await validateMentions(
          campaignId,
          sessionId,
          message.content,
          storedMentions(message.metadata),
          tx,
          this.adventures,
        );
      if (action.status === 'PENDING' && message.metadata?.queued === true) {
        if (await this.resolution.resolveObject(action, message, tx)) {
          await tx
            .update(n.narrativeActions)
            .set({ leaseToken: null, leaseUntil: null })
            .where(eq(n.narrativeActions.id, id));
          return 'NAVIGATION_COMMITTED' as const;
        }
        if (
          message.interactionMode === 'ACT' &&
          normalizeIntent(message.content) === 'desco do cavalo'
        ) {
          await this.resolution.dismount(action, tx);
          await tx
            .update(n.narrativeActions)
            .set({ leaseToken: null, leaseUntil: null })
            .where(eq(n.narrativeActions.id, id));
          return 'NAVIGATION_COMMITTED' as const;
        }
        const selected = message.metadata.selectedOptionId;
        const observe =
          (message.interactionMode === 'OUT_OF_CHARACTER' &&
            (await travelPending(sessionId, tx))) ||
          message.interactionMode === 'THINK' ||
          message.interactionMode === 'ROLL_RESULT' ||
          (message.interactionMode === 'REQUEST_CHECK' &&
            typeof selected !== 'string');
        if (observe || typeof selected === 'string') {
          const proposal = observe
            ? { kind: 'OBSERVE' as const }
            : { kind: 'SCENE' as const, optionId: selected as string };
          await tx
            .update(n.narrativeActions)
            .set({ proposal })
            .where(eq(n.narrativeActions.id, id));
          await this.resolution.resolve(action, proposal, tx);
          if (observe) {
            const resolved = await this.action(campaignId, sessionId, id, tx);
            if (!resolved.confirmed)
              throw new ConflictException('Resposta oficial ausente.');
            const published = await this.publishNote(
              campaignId,
              sessionId,
              resolved.confirmed.narrative,
              {
                clarification: true,
                actionId: id,
                ...(await this.batchFragment(message, tx)),
              },
              tx,
              resolved.confirmed.eventIds,
            );
            await tx
              .update(n.narrativeActions)
              .set({ status: 'COMPLETED', masterMessageId: published.id })
              .where(eq(n.narrativeActions.id, id));
          }
          await tx
            .update(n.narrativeActions)
            .set({ leaseToken: null, leaseUntil: null })
            .where(eq(n.narrativeActions.id, id));
          return 'NAVIGATION_COMMITTED' as const;
        }
      }
      if (
        action.status === 'PENDING' &&
        (await this.resolution.resolveNavigation(action, message, tx))
      ) {
        await tx
          .update(n.narrativeActions)
          .set({ leaseToken: null, leaseUntil: null })
          .where(eq(n.narrativeActions.id, id));
        return 'NAVIGATION_COMMITTED' as const;
      }
      return {
        action,
        token,
        revision,
        message,
        context:
          action.status === 'PENDING'
            ? await this.context.build(campaignId, sessionId, tx, message.id)
            : {
                rendering: modelRendering(
                  await this.context.rendering(
                    campaignId,
                    sessionId,
                    message.id,
                    tx,
                  ),
                ),
              },
      };
    });
    if (!lease) return this.get(campaignId, sessionId, id);
    if (lease === 'NAVIGATION_COMMITTED')
      return this.retry(campaignId, sessionId, id);
    // Keep the adjudication flag used by the graph, without serializing its
    // server-only encounter, cast identity, or mechanics payload.
    const proposalContext =
      'adventure' in lease.context && lease.context.adventure?.integrityEnabled
        ? {
            ...lease.context,
            adventure: {
              gm: {
                localAdjudicationRequired:
                  lease.context.adventure.gm?.localAdjudicationRequired,
              },
            },
          }
        : lease.context;
    let providerFailure: string | null = null;
    try {
      const stage: 'PROPOSE' | 'NARRATE' =
        lease.action.status === 'PENDING' ? 'PROPOSE' : 'NARRATE';
      const response = turnResponseSchema.parse(
        await this.ai.turn({
          actionId: id,
          campaignId,
          sessionId,
          stage,
          interactionMode: lease.message.interactionMode,
          playerMessage:
            lease.message.interactionMode === 'THINK'
              ? 'Pensamento privado registrado.'
              : lease.message.content,
          context:
            stage === 'PROPOSE'
              ? {
                  ...proposalContext,
                  mentions:
                    lease.message.interactionMode === 'THINK'
                      ? []
                      : storedMentions(lease.message.metadata),
                  selectedOptionId:
                    lease.message.metadata?.selectedOptionId ?? null,
                  selectedMechanic:
                    lease.message.metadata?.selectedMechanic ?? null,
                }
              : lease.context,
          confirmed: lease.action.confirmed,
        }),
      );
      await this.database.db.transaction(async (tx) => {
        await this.locked(campaignId, sessionId, tx);
        const current = await this.action(campaignId, sessionId, id, tx);
        if (current.leaseToken !== lease.token)
          throw new ConflictException('Action lease expired');
        if (response.usage.length)
          await tx
            .insert(n.aiUsage)
            .values(response.usage.map((u) => ({ actionId: id, stage, ...u })));
      });
      if (response.error) {
        providerFailure = response.error;
        throw new Error('Provider unavailable');
      }
      await this.database.db.transaction(async (tx) => {
        const session = await this.locked(campaignId, sessionId, tx);
        const action = await this.action(campaignId, sessionId, id, tx);
        if (
          action.leaseToken !== lease.token ||
          session.status !== 'IN_PROGRESS' ||
          lease.revision !==
            (await this.context.revision(campaignId, sessionId, tx))
        )
          throw new ConflictException('Context changed during generation');
        if (stage === 'PROPOSE') {
          const proposal = parseInput(
            narrativeProposalSchema,
            response.proposal,
          );
          await tx
            .update(n.narrativeActions)
            .set({ proposal })
            .where(eq(n.narrativeActions.id, id));
          await this.resolution.resolve(action, proposal, tx);
          await tx
            .update(n.narrativeActions)
            .set({ leaseToken: null, leaseUntil: null })
            .where(eq(n.narrativeActions.id, id));
        } else {
          const narration = parseInput(narrationSchema, response.narration);
          if (!action.confirmed)
            throw new ConflictException('Missing official outcome');
          const rendering = await this.context.rendering(
            campaignId,
            sessionId,
            action.playerMessageId,
            tx,
          );
          const validation = rendering
            ? validateRendering(narration, action.confirmed, rendering)
            : null;
          const verified = validation
            ? validation.accepted
            : narration.narrative === action.confirmed.narrative &&
              JSON.stringify(narration.eventIds) ===
                JSON.stringify(action.confirmed.eventIds);
          const final = validation?.narration ?? action.confirmed;
          const replyId = rendering
            ? await this.resolution.rememberReply(action, final, tx)
            : undefined;
          const message = await publishNarration(
            this.messages,
            tx,
            { campaignId, sessionId },
            final,
            {
              ...(await this.batchFragment(lease.message, tx)),
              eventIds: replyId ? [...final.eventIds, replyId] : final.eventIds,
              ...(lease.message.interactionMode === 'OUT_OF_CHARACTER'
                ? { clarification: true }
                : {}),
              deterministicFallback:
                !verified ||
                response.usage.some((u) => u.error === 'INVALID_RESPONSE'),
              ...(rendering
                ? { renderingValidation: validation?.reason ?? 'ACCEPTED' }
                : {}),
              ...(rendering?.dialogue
                ? { dialogueProvenance: dialogueProvenance(rendering, final) }
                : {}),
            },
          );
          await tx
            .update(n.narrativeActions)
            .set({
              masterMessageId: message.id,
              status: 'COMPLETED',
              error: null,
              leaseToken: null,
              leaseUntil: null,
            })
            .where(eq(n.narrativeActions.id, id));
        }
      });
      if (stage === 'PROPOSE') {
        const current = await this.action(campaignId, sessionId, id);
        if (current.status === 'COMMITTED')
          return this.retry(campaignId, sessionId, id);
      }
    } catch {
      // Exceptions may contain prompts, SDK responses or SQL. None are public/logged.
      const explanations: Record<string, string> = {
        MODEL_UNAVAILABLE:
          'O modelo do Mestre está indisponível. A configuração do provedor precisa ser revista antes de tentar novamente.',
        FREE_TIER_NOT_CONFIRMED:
          'O uso do provedor aguarda confirmação explícita da modalidade gratuita.',
        RATE_LIMIT:
          'O provedor atingiu um limite de requisições. Aguarde a liberação da cota antes de tentar novamente.',
        AUTHENTICATION:
          'O acesso ao provedor precisa ser revisto na configuração do servidor.',
      };
      const explanation = providerFailure && explanations[providerFailure];
      await this.database.db.transaction(async (tx) => {
        await this.locked(campaignId, sessionId, tx);
        await tx
          .update(n.narrativeActions)
          .set({
            error: explanation
              ? `${explanation} Sua mensagem e o progresso confirmado estão salvos.`
              : 'Não foi possível validar a resposta do Mestre. Sua mensagem e o progresso confirmado estão salvos. Retome a sessão e tente novamente.',
            leaseToken: null,
            leaseUntil: null,
          })
          .where(
            and(
              eq(n.narrativeActions.id, id),
              eq(n.narrativeActions.leaseToken, lease.token),
            ),
          );
      });
    }
    return this.get(campaignId, sessionId, id);
  }
  async resume(
    campaignId: string,
    sessionId: string,
    id: string,
    kind: 'roll' | 'stunts',
  ) {
    await this.database.db.transaction(async (tx) => {
      const session = await this.locked(campaignId, sessionId, tx);
      if (session.status !== 'IN_PROGRESS')
        throw new ConflictException('Resume the session first');
      const action = await this.action(campaignId, sessionId, id, tx);
      if (['COMMITTED', 'COMPLETED'].includes(action.status)) return;
      if (kind === 'roll') await this.resolution.roll(action, tx);
      else await this.resolution.declineNpcStunts(action, tx);
      await tx
        .update(n.narrativeActions)
        .set({ leaseToken: null, leaseUntil: null })
        .where(eq(n.narrativeActions.id, id));
    });
    return this.retry(campaignId, sessionId, id);
  }
  async cancel(campaignId: string, sessionId: string, id: string) {
    await this.database.db.transaction(async (tx) => {
      await this.locked(campaignId, sessionId, tx);
      const action = await this.action(campaignId, sessionId, id, tx);
      if (action.status === 'REJECTED') return;
      if (
        action.status !== 'PENDING' &&
        !(
          action.status === 'AWAITING_ROLL' &&
          action.proposal?.kind === 'MECHANIC'
        )
      )
        throw new ConflictException(
          'Committed or pending mechanical effects must be resolved',
        );
      await tx
        .update(n.narrativeActions)
        .set({
          status: 'REJECTED',
          leaseToken: null,
          leaseUntil: null,
          error: null,
        })
        .where(eq(n.narrativeActions.id, id));
    });
    return this.get(campaignId, sessionId, id);
  }
  async mentions(
    campaignId: string,
    sessionId: string,
    symbol: '@' | '#',
    query: string,
  ) {
    return this.database.db.transaction(
      async (tx) =>
        filterMentions(
          await authorizedMentions(campaignId, sessionId, tx, this.adventures),
          symbol,
          query,
        ),
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }
  async state(campaignId: string, sessionId: string) {
    const session = await this.sessions.find(campaignId, sessionId);
    if (!session) throw new NotFoundException('Session not found');
    const [latest] = await this.database.db
      .select({ id: n.narrativeActions.id })
      .from(n.narrativeActions)
      .where(
        and(
          eq(n.narrativeActions.campaignId, campaignId),
          eq(n.narrativeActions.sessionId, sessionId),
        ),
      )
      .orderBy(
        desc(sql`${n.narrativeActions.status} NOT IN ('COMPLETED','REJECTED')`),
        desc(n.narrativeActions.createdAt),
        desc(n.narrativeActions.id),
      )
      .limit(1);
    const [prepared] = await this.database.db
      .select()
      .from(n.sessionPlans)
      .where(eq(n.sessionPlans.sessionId, sessionId));
    const done = await this.context.completedOptions(campaignId, sessionId);
    const traveling = await travelPending(sessionId, this.database.db);
    const navigation =
      session.status === 'IN_PROGRESS' && !traveling
        ? (await this.context.build(campaignId, sessionId)).adventure
            ?.navigation
        : undefined;
    const guidedRoute = (
      await this.adventures.guidedRelease(campaignId, this.database.db)
    )?.directRoute;
    return {
      ...(navigation ? { navigation } : {}),
      mounts: await publicMounts(campaignId, this.database.db),
      availableMechanics:
        session.status === 'IN_PROGRESS' && !traveling
          ? await this.mechanicalOptions(
              campaignId,
              sessionId,
              prepared?.plan.presentCharacterIds ?? [],
              createHash('sha256')
                .update(JSON.stringify(prepared?.plan ?? null))
                .digest('hex'),
            )
          : [],
      availableOptions: [
        ...(session.status === 'LOCKED' || traveling
          ? []
          : (prepared?.plan.options ?? [])
        )
          .filter(
            (o) =>
              !done.includes(o.id) &&
              o.requiresOptionIds.every((id) => done.includes(id)),
          )
          .map((o) => ({
            id: o.id,
            intent: o.intent,
            mode: o.mode,
            ...(guidedRoute?.intent === o.intent
              ? { suggestedContent: guidedRoute.playerText }
              : {}),
          })),
        ...(navigation?.exits
          .filter((e) => e.status === 'OPEN')
          .map((e) => ({ id: e.id, intent: e.label, mode: 'ACT' })) ?? []),
      ],
      ...(await this.context.progress(campaignId, sessionId)),
      action: latest ? await this.get(campaignId, sessionId, latest.id) : null,
    };
  }
  private async mechanicalOptions(
    campaignId: string,
    sessionId: string,
    present: string[],
    preparedFor: string,
  ) {
    const db = this.database.db;
    const [pc] = await db
      .select()
      .from(g.characters)
      .where(
        and(
          eq(g.characters.campaignId, campaignId),
          eq(g.characters.kind, 'PROTAGONIST'),
        ),
      );
    if (!pc || !present.includes(pc.id)) return [];
    const features = await db
      .select()
      .from(g.characterFeatures)
      .where(eq(g.characterFeatures.characterId, pc.id));
    const has = (id: string) => features.some((f) => f.ruleId === id);
    const options: { label: string; command: MechanicalAction }[] = [];
    const loaded = await loadAdventure(campaignId, db);
    if (loaded)
      options.push(
        ...(this.adventures
          .forDefinition(loaded.definition)
          .narrativeOptions?.(loaded.instance.mechanics, pc.id) ?? []),
      );
    const add = (label: string, command: MechanicalAction) =>
      options.push({ label, command });
    if (has('second-sight'))
      add('Usar Segunda Visão', {
        type: 'ARCANA_USE',
        input: { characterId: pc.id, arcanum: 'second-sight' },
      });
    if (has('psychic-shield'))
      for (const raised of [true, false])
        add(raised ? 'Erguer Escudo Psíquico' : 'Baixar Escudo Psíquico', {
          type: 'ARCANA_USE',
          input: { arcanum: 'psychic-shield', characterId: pc.id, raised },
        });
    if (has('body-control'))
      for (const tradition of ['HEALING', 'MEDITATIVE'] as const)
        if (has(`${tradition.toLowerCase()}-talent`))
          for (const use of [
            'IGNORE_PAIN',
            'BODY_AWARENESS',
            'HALF_BREATHING',
          ] as const)
            add(
              `Controle Corporal em si: ${{ IGNORE_PAIN: 'ignorar dor', BODY_AWARENESS: 'consciência corporal', HALF_BREATHING: 'respirar lentamente' }[use]}`,
              {
                type: 'ARCANA_USE',
                input: {
                  characterId: pc.id,
                  targetId: pc.id,
                  arcanum: 'body-control',
                  tradition,
                  use,
                },
              },
            );
    if (has('cure') && has('healing-talent')) {
      const targets = await db
        .select()
        .from(g.characters)
        .where(
          and(
            eq(g.characters.campaignId, campaignId),
            inArray(g.characters.id, present),
            eq(g.characters.known, true),
          ),
        );
      for (const target of targets)
        add(`Curar ${target.name} (ao toque)`, {
          type: 'CURE',
          characterId: pc.id,
          targetId: target.id,
        });
    }
    const contexts = await db
      .select()
      .from(arcana.arcaneContexts)
      .where(
        and(
          eq(arcana.arcaneContexts.campaignId, campaignId),
          eq(arcana.arcaneContexts.sessionId, sessionId),
          eq(arcana.arcaneContexts.characterId, pc.id),
          eq(arcana.arcaneContexts.preparedFor, preparedFor),
        ),
      );
    for (const context of contexts) {
      if (
        context.value.kind === 'WIND' &&
        has('wind-shaping') &&
        has('shaping-talent')
      )
        for (const category of [0, 1, 2, 3])
          add(
            `Moldar Vento: ${['brisa', 'vento moderado', 'vento forte', 'ventania'][category]}`,
            {
              type: 'ARCANA_USE',
              input: {
                characterId: pc.id,
                arcanum: 'wind-shaping',
                contextId: context.id,
                category,
              },
            },
          );
      if (
        context.value.kind === 'OBJECT' &&
        has('move-object') &&
        has('shaping-talent')
      )
        add('Mover objeto preparado', {
          type: 'ARCANA_USE',
          input: {
            characterId: pc.id,
            arcanum: 'move-object',
            contextId: context.id,
            fatigue: false,
          },
        });
    }
    const effects = await db
      .select()
      .from(arcana.arcaneEffects)
      .where(
        and(
          eq(arcana.arcaneEffects.campaignId, campaignId),
          eq(arcana.arcaneEffects.characterId, pc.id),
          eq(arcana.arcaneEffects.active, true),
          eq(arcana.arcaneEffects.sustained, true),
        ),
      );
    for (const effect of effects)
      add('Encerrar concentração em um efeito ativo', {
        type: 'ARCANA_END',
        characterId: pc.id,
        effectId: effect.id,
      });
    add('Tomar um fôlego (5 minutos)', {
      type: 'REST',
      characterId: pc.id,
      kind: 'BREATHER',
    });
    return options;
  }
  async summary(campaignId: string, sessionId: string) {
    const session = await this.sessions.find(campaignId, sessionId);
    if (!session) throw new NotFoundException('Session not found');
    return { summary: session.summary };
  }
  async finalize(
    campaignId: string,
    sessionId: string,
    endingType: 'OBJECTIVE_COMPLETED' | 'NARRATIVE_PAUSE' | 'PLAYER_REQUESTED',
  ) {
    // No summary LLM call: factual summaries come only from confirmed public events.
    // Summary and lifecycle commit together in SessionsService; retry is safe.
    return this.lifecycle.completeNarrative(campaignId, sessionId, endingType);
  }
  async usage(campaignId: string, sessionId: string) {
    if (!(await this.sessions.find(campaignId, sessionId)))
      throw new NotFoundException('Session not found');
    const perTurn = this.database.db
      .select({
        actionId: n.aiUsage.actionId,
        provider: n.aiUsage.provider,
        model: n.aiUsage.model,
        requests: sql<number>`count(*)::int`.as('requests'),
        inputTokens: sql<number>`sum(${n.aiUsage.inputTokens})::int`.as(
          'input_tokens',
        ),
        outputTokens: sql<number>`sum(${n.aiUsage.outputTokens})::int`.as(
          'output_tokens',
        ),
        totalTokens: sql<number | null>`sum(${n.aiUsage.totalTokens})::int`.as(
          'total_tokens',
        ),
        inputCharacters: sql<number>`sum(${n.aiUsage.inputCharacters})::int`.as(
          'input_characters',
        ),
        durationMs: sql<number>`sum(${n.aiUsage.durationMs})::int`.as(
          'duration_ms',
        ),
        errors:
          sql<number>`count(*) FILTER (WHERE ${n.aiUsage.error} IS NOT NULL)::int`.as(
            'errors',
          ),
        rateLimits:
          sql<number>`count(*) FILTER (WHERE ${n.aiUsage.error} = 'RATE_LIMIT')::int`.as(
            'rate_limits',
          ),
        usageReportedRequests:
          sql<number>`count(*) FILTER (WHERE ${n.aiUsage.usageReported})::int`.as(
            'usage_reported_requests',
          ),
      })
      .from(n.aiUsage)
      .innerJoin(
        n.narrativeActions,
        eq(n.narrativeActions.id, n.aiUsage.actionId),
      )
      .where(
        and(
          eq(n.narrativeActions.campaignId, campaignId),
          eq(n.narrativeActions.sessionId, sessionId),
        ),
      )
      .groupBy(n.aiUsage.actionId, n.aiUsage.provider, n.aiUsage.model)
      .as('per_turn');
    return this.database.db
      .select({
        provider: perTurn.provider,
        model: perTurn.model,
        requests: sql<number>`sum(${perTurn.requests})::int`,
        turns: sql<number>`count(*)::int`,
        maxRequestsPerTurn: sql<number>`max(${perTurn.requests})::int`,
        inputTokens: sql<number>`sum(${perTurn.inputTokens})::int`,
        outputTokens: sql<number>`sum(${perTurn.outputTokens})::int`,
        totalTokens: sql<number | null>`sum(${perTurn.totalTokens})::int`,
        inputCharacters: sql<number>`sum(${perTurn.inputCharacters})::int`,
        durationMs: sql<number>`sum(${perTurn.durationMs})::int`,
        averageLatencyMs: sql<number>`(sum(${perTurn.durationMs}) / sum(${perTurn.requests}))::int`,
        errors: sql<number>`sum(${perTurn.errors})::int`,
        rateLimits: sql<number>`sum(${perTurn.rateLimits})::int`,
        usageReportedRequests: sql<number>`sum(${perTurn.usageReportedRequests})::int`,
      })
      .from(perTurn)
      .groupBy(perTurn.provider, perTurn.model);
  }
}
