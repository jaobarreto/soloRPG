import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CampaignsRepository } from '../campaigns/campaigns.repository';
import { DatabaseService } from '../database/database.service';
import { and, eq } from 'drizzle-orm';
import { combatEncounters } from '../database/game-schema';
import { gameEvents } from '../database/game-schema';
import { narrativeActions, sessionPlans } from '../database/narrative-schema';
import { inArray, sql } from 'drizzle-orm';
import type { SessionRecord } from '../database/schema';
import { SessionResponseDto } from './dto/session-response.dto';
import { SessionsRepository } from './sessions.repository';
import { transitionSession, type SessionAction } from './session-state';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly campaigns: CampaignsRepository,
    private readonly repository: SessionsRepository,
  ) {}
  async list(campaignId: string): Promise<SessionResponseDto[]> {
    if (!(await this.campaigns.find(campaignId)))
      throw new NotFoundException('Campaign not found');
    return (await this.repository.list(campaignId)).map((row) =>
      SessionResponseDto.from(row),
    );
  }
  async detail(campaignId: string, id: string): Promise<SessionResponseDto> {
    const session = await this.repository.find(campaignId, id);
    if (!session) throw new NotFoundException('Session not found in campaign');
    return SessionResponseDto.from(session);
  }
  async transition(
    campaignId: string,
    id: string,
    action: SessionAction,
    endingType?: NonNullable<SessionRecord['endingType']>,
    narrative = false,
  ): Promise<SessionResponseDto> {
    const session = await this.database.db.transaction(async (tx) => {
      // Always lock campaign before session. This serializes cross-session lifecycle changes.
      const campaign = await this.campaigns.lock(campaignId, tx);
      if (!campaign) throw new NotFoundException('Campaign not found');
      const current = await this.repository.lock(campaignId, id, tx);
      if (!current)
        throw new NotFoundException('Session not found in campaign');
      if (
        narrative &&
        action === 'complete' &&
        current.status === 'COMPLETED'
      ) {
        if (current.endingType !== endingType)
          throw new ConflictException('Session ended with another reason');
        return current;
      }
      if (action === 'complete') {
        if (!narrative) {
          const [prepared] = await tx
            .select()
            .from(sessionPlans)
            .where(eq(sessionPlans.sessionId, id));
          if (prepared)
            throw new ConflictException(
              'Use narrative finalization for prepared sessions',
            );
        }
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
          throw new ConflictException(
            'Resolve the pending narrative action before ending',
          );
        if (narrative && current.status !== 'COMPLETED') {
          const [plan] = await tx
            .select()
            .from(sessionPlans)
            .where(eq(sessionPlans.sessionId, id));
          const completed = await tx
            .select({ optionId: narrativeActions.optionId })
            .from(narrativeActions)
            .where(
              and(
                eq(narrativeActions.sessionId, id),
                eq(narrativeActions.status, 'COMPLETED'),
                eq(narrativeActions.success, true),
              ),
            );
          const evidence = completed.map((r) => r.optionId);
          if (
            endingType === 'OBJECTIVE_COMPLETED' &&
            (!plan?.plan.objectives.length ||
              !plan.plan.objectives.every((o) =>
                o.requiredOptionIds.every((key) => evidence.includes(key)),
              ))
          )
            throw new ConflictException('Objective lacks confirmed evidence');
        }
        const [combat] = await tx
          .select()
          .from(combatEncounters)
          .where(
            and(
              eq(combatEncounters.campaignId, campaignId),
              eq(combatEncounters.status, 'ACTIVE'),
            ),
          );
        if (combat)
          throw new ConflictException(
            'Session cannot be completed in its current state',
          );
      }
      const now = new Date(); // Sample after locks; never count waiting time twice.
      const patch = transitionSession(current, action, now, endingType);
      if (
        narrative &&
        action === 'complete' &&
        current.status !== 'COMPLETED'
      ) {
        const events = await tx
          .select({ description: gameEvents.description })
          .from(gameEvents)
          .where(
            and(
              eq(gameEvents.sessionId, id),
              inArray(gameEvents.visibility, ['PUBLIC', 'PLAYER_ONLY']),
              inArray(gameEvents.type, [
                'CONSEQUENCE_RECORDED',
                'RELATIONSHIP_CHANGED',
                'ITEM_TRANSFERRED',
                'DAMAGE_APPLIED',
                'ATTACK_MISSED',
                'LOCATION_UPDATED',
              ]),
            ),
          )
          .orderBy(gameEvents.sequence);
        // Generate from source events, never from proposed or generated prose. A DB
        // failure rolls back completion, leaving the full session recoverable.
        patch.summary = events.length
          ? [...new Set(events.map((e) => e.description))].join('\n')
          : 'Sessão encerrada sem novos acontecimentos confirmados.';
      }
      if (action === 'start') {
        if (campaign.status === 'COMPLETED')
          throw new ConflictException('Campaign is completed');
        if (await this.repository.findOtherActive(campaignId, id, tx))
          throw new ConflictException('Another session is running or paused');
        if (current.sessionNumber > 1) {
          const previous = await this.repository.atNumber(
            campaignId,
            current.sessionNumber - 1,
            tx,
          );
          if (previous?.status !== 'COMPLETED')
            throw new ConflictException('Previous session must be completed');
        }
        await this.campaigns.update(
          campaignId,
          {
            status: 'ACTIVE',
            currentSessionNumber: current.sessionNumber,
            updatedAt: now,
          },
          tx,
        );
      }
      const updated = await this.repository.update(id, patch, tx);
      if (action === 'complete') {
        if (current.sessionNumber === campaign.plannedSessions) {
          await this.campaigns.update(
            campaignId,
            { status: 'COMPLETED', completedAt: now, updatedAt: now },
            tx,
          );
        } else {
          const next = await this.repository.atNumber(
            campaignId,
            current.sessionNumber + 1,
            tx,
          );
          if (!next || next.status !== 'LOCKED')
            throw new ConflictException('Next planned session is unavailable');
          await this.repository.update(
            next.id,
            { status: 'AVAILABLE', updatedAt: now },
            tx,
          );
          await this.campaigns.update(campaignId, { updatedAt: now }, tx);
        }
      }
      return updated;
    });
    this.logger.log({ event: `session.${action}`, campaignId, sessionId: id });
    return SessionResponseDto.from(session);
  }
  completeNarrative(
    campaignId: string,
    sessionId: string,
    endingType: NonNullable<SessionRecord['endingType']>,
  ) {
    return this.transition(campaignId, sessionId, 'complete', endingType, true);
  }
}
