import { randomUUID } from 'node:crypto';
import { and, desc, eq, or, sql } from 'drizzle-orm';
import { ApiProperty } from '@nestjs/swagger';
import { librarySessionResets } from '../database/library-schema';
import { campaignSessions, sessionMessages } from '../database/schema';
import { deleteExecution } from './delete-execution';
import { lockExecutionIdentity } from './execution-lock';
import type { DatabaseTransaction } from '../database/database.service';
import { DatabaseService } from '../database/database.service';
import { directorState } from '../adventures/core/director/director';
import { loadAdventure } from '../adventures/core/state/state';
import { AdventureRegistry } from '../adventures/core/registry/registry';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CampaignsRepository } from './campaigns.repository';
import { CreateCampaignDto, UpdateCampaignDto } from './dto/campaign-input.dto';
import {
  CampaignDetailDto,
  CampaignResponseDto,
} from './dto/campaign-response.dto';
import { SessionResponseDto } from '../sessions/dto/session-response.dto';

export class ResetSessionResponseDto {
  @ApiProperty({ type: String })
  campaignId!: string;
  @ApiProperty({ type: String })
  sessionId!: string;
}

@Injectable()
export class CampaignsService {
  private readonly logger = new Logger(CampaignsService.name);
  constructor(
    private readonly repository: CampaignsRepository,
    private readonly adventures: AdventureRegistry,
    private readonly database: DatabaseService,
  ) {}
  async create(input: CreateCampaignDto): Promise<CampaignDetailDto> {
    if (input.requestId) {
      const id = input.requestId.toLowerCase();
      const [retired] = await this.database.db
        .select({ id: librarySessionResets.sequence })
        .from(librarySessionResets)
        .where(
          or(
            eq(librarySessionResets.previousCampaignId, id),
            eq(librarySessionResets.replacementCampaignId, id),
          ),
        );
      if (
        retired ||
        (await this.adventures.guidedRelease(id, this.database.db))
      )
        throw new ConflictException(
          'Use a biblioteca para abrir esta aventura.',
        );
    }
    const adventure = this.adventures.forNewCampaign();
    const { campaign, sessions } = await this.repository.create(
      {
        id: input.requestId,
        title: input.title,
        description: input.description,
        plannedSessions: adventure.definition.sessions.length,
      },
      [],
      adventure,
    );
    this.logger.log({
      event: 'campaign.created',
      campaignId: campaign.id,
      plannedSessions: campaign.plannedSessions,
    });
    return {
      ...CampaignResponseDto.from(campaign),
      sessions: sessions.map((row) => SessionResponseDto.from(row)),
    };
  }
  private async currentExecution(slot: string, tx: DatabaseTransaction) {
    const [latest] = await tx
      .select({ id: librarySessionResets.replacementCampaignId })
      .from(librarySessionResets)
      .where(eq(librarySessionResets.slotId, slot))
      .orderBy(desc(librarySessionResets.sequence))
      .limit(1);
    return latest?.id ?? slot;
  }

  async resetLibrarySession(
    campaignId: string,
    sessionId: string,
    confirmed: boolean,
  ): Promise<ResetSessionResponseDto> {
    if (!confirmed)
      throw new BadRequestException(
        'Confirme a exclusão do progresso para reiniciar.',
      );
    const { module, release } = this.adventures.library();
    return this.database.db.transaction(async (tx) => {
      await lockExecutionIdentity(release.campaignId, tx);
      const [prior] = await tx
        .select()
        .from(librarySessionResets)
        .where(
          and(
            eq(librarySessionResets.slotId, release.campaignId),
            eq(librarySessionResets.previousCampaignId, campaignId),
            eq(librarySessionResets.previousSessionId, sessionId),
          ),
        );
      if (prior)
        return {
          campaignId: prior.replacementCampaignId,
          sessionId: prior.replacementSessionId,
        };
      if (campaignId !== (await this.currentExecution(release.campaignId, tx)))
        throw new NotFoundException(
          'Esta partida não está disponível para reinício.',
        );

      if (campaignId !== release.campaignId)
        await lockExecutionIdentity(campaignId, tx);
      const campaign = await this.repository.lock(campaignId, tx);
      const [session] = await tx
        .select()
        .from(campaignSessions)
        .where(
          and(
            eq(campaignSessions.campaignId, campaignId),
            eq(campaignSessions.id, sessionId),
          ),
        )
        .for('update');
      if (
        !campaign ||
        !session ||
        session.sessionNumber !== 1 ||
        !session.startedAt
      )
        throw new NotFoundException(
          'Selecione a Sessão I já iniciada para reiniciar.',
        );

      const loaded = await loadAdventure(campaignId, tx);
      if (!loaded || loaded.definition.id !== module.definition.id)
        throw new ConflictException(
          'A aventura desta partida não corresponde à biblioteca.',
        );
      const [opening] = await tx
        .select({ metadata: sessionMessages.metadata })
        .from(sessionMessages)
        .where(
          and(
            eq(sessionMessages.sessionId, sessionId),
            sql`${sessionMessages.metadata} ? 'openingRevision'`,
          ),
        )
        .orderBy(sessionMessages.sequenceNumber)
        .limit(1);
      const replacement = await this.repository.createInTransaction(
        {
          id: randomUUID(),
          title: module.definition.title,
          description: release.presentation,
          plannedSessions: module.definition.sessions.length,
        },
        [],
        tx,
        module,
        true,
      );
      const first = replacement.sessions.find(
        (row) => row.sessionNumber === 1,
      )!;
      await deleteExecution(campaignId, tx);
      await tx.insert(librarySessionResets).values({
        slotId: release.campaignId,
        previousCampaignId: campaignId,
        previousSessionId: sessionId,
        replacementCampaignId: replacement.campaign.id,
        replacementSessionId: first.id,
        previousPlanning: loaded.planning?.revision ?? null,
        previousOpening:
          typeof opening?.metadata?.openingRevision === 'string'
            ? opening.metadata.openingRevision
            : null,
        replacementPlanning: release.planning?.revision ?? null,
        replacementOpening: release.opening.revision,
      });
      return { campaignId: replacement.campaign.id, sessionId: first.id };
    });
  }

  async library(open = false) {
    const { module, release } = this.adventures.library();
    const { definition } = module;
    const read = async (tx: DatabaseTransaction) => {
      if (open) await lockExecutionIdentity(release.campaignId, tx);
      const campaignId = await this.currentExecution(release.campaignId, tx);
      let instance = await this.repository.detailInTransaction(campaignId, tx);
      if (!instance && open)
        instance = await this.repository.createInTransaction(
          {
            id: campaignId,
            title: definition.title,
            description: release.presentation,
            plannedSessions: definition.sessions.length,
          },
          [],
          tx,
          module,
          true,
        );
      const first = instance?.sessions.find(
        (session) => session.sessionNumber === 1,
      );
      const loaded = instance && (await loadAdventure(campaignId, tx));
      const publicState =
        loaded && first?.startedAt
          ? (await directorState(loaded, first.id, tx))?.public
          : undefined;
      const planning = (loaded && loaded.planning) || release.planning;
      const intro = planning?.sessions[0];
      const title = intro
        ? `${intro.publicLabel} — ${intro.title}`
        : 'Sessão I';
      const status = first?.status ?? 'AVAILABLE';
      return {
        title: definition.title,
        system: release.system,
        genre: release.genre,
        narrator: release.narrator,
        levels: [definition.minimumLevel, definition.maximumLevel],
        presentation: release.presentation,
        campaignId: instance?.campaign.id ?? null,
        session: {
          id: first?.id ?? null,
          title,
          status,
          progress: publicState?.progress ?? 0,
          ...(publicState?.outcome ? { outcome: publicState.outcome } : {}),
        },
        sessions: planning?.sessions.map((entry) => ({
          number: entry.number,
          title: entry.number === 1 ? title : entry.publicLabel,
          status: entry.number === 1 ? status : 'LOCKED',
        })) ?? [{ number: 1, title, status }],
      };
    };
    return open
      ? this.database.db.transaction(read)
      : this.database.db.transaction(read, {
          isolationLevel: 'repeatable read',
          accessMode: 'read only',
        });
  }
  async list(): Promise<CampaignResponseDto[]> {
    return (await this.repository.list()).map(CampaignResponseDto.from);
  }
  async detail(id: string): Promise<CampaignDetailDto & { guided?: true }> {
    const result = await this.repository.detail(id);
    if (!result) throw new NotFoundException('Campaign not found');
    const release = await this.adventures.guidedRelease(id, this.database.db);
    return {
      ...CampaignResponseDto.from(result.campaign),
      ...(release ? { guided: true } : {}),
      sessions: result.sessions
        .filter(
          (row) =>
            !release || release.releasedSessions.includes(row.sessionNumber),
        )
        .map((row) => SessionResponseDto.from(row)),
    };
  }
  async update(
    id: string,
    input: UpdateCampaignDto,
  ): Promise<CampaignResponseDto> {
    const campaign = await this.repository.update(id, {
      ...input,
      updatedAt: new Date(),
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    return CampaignResponseDto.from(campaign);
  }
}
