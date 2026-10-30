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
} from '@solo-rpg/shared-contracts';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../database/database.service';
import { CampaignsRepository } from '../campaigns/campaigns.repository';
import { SessionsRepository } from '../sessions/sessions.repository';
import { SessionsService } from '../sessions/sessions.service';
import { MessagesRepository } from '../messages/messages.repository';
import { sessionMessages } from '../database/schema';
import * as n from '../database/narrative-schema';
import * as g from '../database/game-schema';
import { AiServiceClient } from '../integrations/ai-service/ai-service.client';
import { parseInput } from '../game-engine/validation';
import { NarrativeContextService } from './context.service';
import { NarrativeResolutionService } from './resolution.service';

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
      const message = await this.messages.insert(
        {
          campaignId,
          sessionId,
          role: 'PLAYER',
          interactionMode: input.interactionMode,
          content: input.content,
          sequenceNumber: (await this.messages.lastSequence(sessionId, tx)) + 1,
          metadata: {
            actionId: input.actionId,
            selectedOptionId: input.optionId ?? null,
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
  async get(campaignId: string, sessionId: string, id: string) {
    const action = await this.action(campaignId, sessionId, id);
    let pendingRoll = null;
    if (action.status === 'AWAITING_ROLL' && action.requestId) {
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
      return {
        action,
        token,
        revision,
        message,
        context:
          action.status === 'PENDING'
            ? await this.context.build(campaignId, sessionId, tx)
            : {},
      };
    });
    if (!lease) return this.get(campaignId, sessionId, id);
    try {
      const stage = lease.action.status === 'PENDING' ? 'PROPOSE' : 'NARRATE';
      const response = turnResponseSchema.parse(
        await this.ai.turn({
          actionId: id,
          campaignId,
          sessionId,
          stage,
          interactionMode: lease.message.interactionMode,
          playerMessage: lease.message.content,
          context: {
            ...lease.context,
            selectedOptionId: lease.message.metadata?.selectedOptionId ?? null,
          },
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
            .values(response.usage.map((u) => ({ actionId: id, ...u })));
      });
      if (response.error) throw new Error('Provider unavailable');
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
          // Free prose is not deterministically verifiable. Fail closed to the exact
          // authorized projection, even if the JSON and references look plausible.
          const verified =
            narration.narrative === action.confirmed.narrative &&
            JSON.stringify(narration.eventIds) ===
              JSON.stringify(action.confirmed.eventIds);
          const final = verified ? narration : action.confirmed;
          const message = await this.messages.insert(
            {
              campaignId,
              sessionId,
              role: 'GAME_MASTER',
              content: final.narrative,
              sequenceNumber:
                (await this.messages.lastSequence(sessionId, tx)) + 1,
              metadata: {
                actionId: id,
                eventIds: final.eventIds,
                deterministicFallback: !verified,
              },
            },
            tx,
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
      await this.database.db.transaction(async (tx) => {
        await this.locked(campaignId, sessionId, tx);
        await tx
          .update(n.narrativeActions)
          .set({
            error:
              'Não foi possível validar a resposta do Mestre. Sua mensagem e o progresso confirmado estão salvos. Retome a sessão e tente novamente.',
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
      if (action.status !== 'PENDING')
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
  async state(campaignId: string, sessionId: string) {
    if (!(await this.sessions.find(campaignId, sessionId)))
      throw new NotFoundException('Session not found');
    const [latest] = await this.database.db
      .select({ id: n.narrativeActions.id })
      .from(n.narrativeActions)
      .where(
        and(
          eq(n.narrativeActions.campaignId, campaignId),
          eq(n.narrativeActions.sessionId, sessionId),
        ),
      )
      .orderBy(desc(n.narrativeActions.createdAt), desc(n.narrativeActions.id))
      .limit(1);
    const [prepared] = await this.database.db
      .select()
      .from(n.sessionPlans)
      .where(eq(n.sessionPlans.sessionId, sessionId));
    const done = await this.context.completedOptions(campaignId, sessionId);
    return {
      availableOptions: (prepared?.plan.options ?? [])
        .filter(
          (o) =>
            !done.includes(o.id) &&
            o.requiresOptionIds.every((id) => done.includes(id)),
        )
        .map((o) => ({ id: o.id, intent: o.intent, mode: o.mode })),
      ...(await this.context.progress(campaignId, sessionId)),
      action: latest ? await this.get(campaignId, sessionId, latest.id) : null,
    };
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
    return this.database.db
      .select({
        provider: n.aiUsage.provider,
        model: n.aiUsage.model,
        requests: sql<number>`count(*)::int`,
        inputTokens: sql<number>`sum(${n.aiUsage.inputTokens})::int`,
        outputTokens: sql<number>`sum(${n.aiUsage.outputTokens})::int`,
        durationMs: sql<number>`sum(${n.aiUsage.durationMs})::int`,
        errors: sql<number>`count(*) FILTER (WHERE ${n.aiUsage.error} IS NOT NULL)::int`,
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
      .groupBy(n.aiUsage.provider, n.aiUsage.model);
  }
}
