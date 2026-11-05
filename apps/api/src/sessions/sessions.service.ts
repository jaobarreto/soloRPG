import { registerHorse } from '../blue-rose/mechanics/mounts';
import { adventureEntityId } from '../adventures/core/state/identity';
import { guidedParty } from '../adventures/core/state/guided-party';
import { isDeepStrictEqual } from 'node:util';
import { MessagesRepository } from '../messages/messages.repository';
import { publishNarration } from '../narrative/publication';
import { validateRendering } from '../narrative/rendering';
import {
  guidedReviewNote,
  interactiveReviewNote,
  validateSuppliedIdentity,
} from '../adventures/core/operations/party-validation';
import {
  activateAdventureScene,
  adventureContext,
} from '../adventures/core/scenes/scene-state';
import { spatialState } from '../adventures/core/navigation/spatial';
import { scenePlanSchema } from '@solo-rpg/shared-contracts';
import { directorState } from '../adventures/core/director/director';
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
import { sessionMessages, type SessionRecord } from '../database/schema';
import { SessionResponseDto } from './dto/session-response.dto';
import { SessionsRepository } from './sessions.repository';
import { transitionSession, type SessionAction } from './session-state';
import {
  adventureProgress,
  digest,
  loadAdventure,
  sheetSnapshot,
} from '../adventures/core/state/state';
import { characterVitals, characters } from '../database/game-schema';
import { adventureScenes } from '../database/adventure-schema';
import { prepareAdventureScene } from '../adventures/core/scenes/execution';
import { AdventureRegistry } from '../adventures/core/registry/registry';

@Injectable()
export class SessionsService {
  private readonly logger = new Logger(SessionsService.name);
  constructor(
    private readonly database: DatabaseService,
    private readonly campaigns: CampaignsRepository,
    private readonly repository: SessionsRepository,
    private readonly adventures: AdventureRegistry,
    private readonly messages: MessagesRepository,
  ) {}
  async list(campaignId: string): Promise<SessionResponseDto[]> {
    if (!(await this.campaigns.find(campaignId)))
      throw new NotFoundException('Campaign not found');
    const release = await this.adventures.guidedRelease(
      campaignId,
      this.database.db,
    );
    return (await this.repository.list(campaignId))
      .filter(
        (row) =>
          !release || release.releasedSessions.includes(row.sessionNumber),
      )
      .map((row) => SessionResponseDto.from(row));
  }
  async detail(campaignId: string, id: string): Promise<SessionResponseDto> {
    const session = await this.repository.find(campaignId, id);
    const release = await this.adventures.guidedRelease(
      campaignId,
      this.database.db,
    );
    if (
      !session ||
      (release && !release.releasedSessions.includes(session.sessionNumber))
    )
      throw new NotFoundException('Session not found in campaign');
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
      const release = await this.adventures.guidedRelease(campaignId, tx);
      if (
        action === 'start' &&
        release &&
        !release.releasedSessions.includes(current.sessionNumber)
      )
        throw new ConflictException(
          'Esta sessão ainda não está disponível na biblioteca.',
        );
      if (
        action === 'start' &&
        release &&
        !current.startedAt &&
        !(await guidedParty(campaignId, tx))
      )
        throw new ConflictException(
          'Confirme a protagonista e a companhia antes de iniciar.',
        );

      const imported =
        action === 'start' ? await loadAdventure(campaignId, tx) : null;
      const configuredOpening = release?.opening;
      const openingSource =
        configuredOpening?.source === 'APPROVED_TEXT' &&
        configuredOpening.planningRevision &&
        configuredOpening.planningRevision !== imported?.planning?.revision
          ? undefined
          : configuredOpening;
      const registered =
        imported && this.adventures.forDefinition(imported.definition);
      const openingRequested =
        current.sessionNumber === 1 &&
        registered?.interactivePreparation &&
        imported?.instance.reviewNotes ===
          (release ? guidedReviewNote : interactiveReviewNote);
      if (
        (openingRequested || (release && action === 'start')) &&
        current.startedAt
      )
        return current;
      if (
        release &&
        action === 'start' &&
        current.sessionNumber === 1 &&
        !openingRequested
      )
        throw new ConflictException(
          'Confirme a preparação na biblioteca antes de iniciar.',
        );
      let terminal = false;
      if (action === 'complete') {
        const [queued] = await tx
          .select({ id: sessionMessages.id })
          .from(sessionMessages)
          .where(
            and(
              eq(sessionMessages.sessionId, id),
              sql`${sessionMessages.metadata}->>'queued' = 'true'`,
            ),
          )
          .limit(1);
        if (queued)
          throw new ConflictException(
            'Processe as mensagens pendentes antes de concluir.',
          );
        const imported = await loadAdventure(campaignId, tx);
        if (imported?.definition.progression) {
          const director = await directorState(imported, id, tx);
          if (endingType !== 'OBJECTIVE_COMPLETED' || !director?.eligible)
            throw new ConflictException(
              'Narrative closure requires confirmed objectives; pause to continue this chat later',
            );
          terminal = director.terminal;
          if (current.sessionNumber === campaign.plannedSessions && !terminal)
            throw new ConflictException(
              'The last unit requires a confirmed terminal outcome',
            );
          await tx.insert(gameEvents).values({
            campaignId,
            sessionId: id,
            commandId: current.id,
            type: 'NARRATIVE_UNIT_COMPLETED',
            description: 'Encerramento narrativo confirmado pelo Director.',
            visibility: 'GM_ONLY',
            changes: {
              definitionId: imported.instance.definitionId,
              unitKey: director.unit.key,
              ...(imported.planning
                ? { planningRevision: imported.planning.revision }
                : {}),
              terminal,
              evidenceEventIds: director.evidenceEventIds,
            },
          });
        }
        if (imported)
          this.adventures
            .forDefinition(imported.definition)
            .assertIdle?.(imported.instance.mechanics);
        const [dying] = await tx
          .select({ id: characters.id })
          .from(characters)
          .innerJoin(
            characterVitals,
            eq(characterVitals.characterId, characters.id),
          )
          .where(
            and(
              eq(characters.campaignId, campaignId),
              eq(characterVitals.lifeState, 'DYING'),
            ),
          )
          .limit(1);
        if (dying)
          throw new ConflictException(
            'Resolve dying characters before ending narrative time',
          );
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
          const imported = await adventureProgress(campaignId, id, tx);
          if (
            endingType === 'OBJECTIVE_COMPLETED' &&
            (imported
              ? !imported.objectiveCompleted
              : !plan?.plan.objectives.length ||
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
        const loaded = await loadAdventure(campaignId, tx);
        const eventTypes = loaded
          ? (this.adventures.forDefinition(loaded.definition)
              .publicEventTypes ?? [])
          : [];
        const events = await tx
          .select({ description: gameEvents.description })
          .from(gameEvents)
          .where(
            and(
              eq(gameEvents.sessionId, id),
              inArray(gameEvents.visibility, ['PUBLIC', 'PLAYER_ONLY']),
              inArray(gameEvents.type, [
                ...eventTypes,
                'NARRATIVE_TIME_ADVANCED',
                'ARCANA_RESOLVED',
                'REST_COMPLETED',
                'CONSEQUENCE_RECORDED',
                'RELATIONSHIP_CHANGED',
                'ITEM_TRANSFERRED',
                'DAMAGE_APPLIED',
                'ATTACK_MISSED',
                'LOCATION_UPDATED',
                'ADVENTURE_LOCATION_ENTERED',
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
        if (imported) {
          if (
            !imported.instance.protagonistId ||
            !imported.instance.reviewedDigest
          )
            throw new ConflictException(
              'Confira e confirme as fichas da campanha antes de iniciar.',
            );
          if (current.sessionNumber === 1) {
            const snapshot = await sheetSnapshot(campaignId, tx);
            if (imported.instance.reviewedDigest !== digest(snapshot))
              throw new ConflictException(
                'As fichas mudaram. Confira e confirme a preparação novamente.',
              );
            if (
              !snapshot.cast.some(
                (c) =>
                  c.kind === 'PROTAGONIST' &&
                  c.id === imported.instance.protagonistId,
              )
            )
              throw new ConflictException(
                'A protagonista vinculada não corresponde à ficha revisada.',
              );
            if (openingRequested) {
              if (
                imported.instance.entityNamespace !==
                  registered!.entityNamespace ||
                !isDeepStrictEqual(
                  imported.definition,
                  JSON.parse(JSON.stringify(registered!.definition)),
                )
              )
                throw new ConflictException(
                  'A versão da aventura não pôde ser verificada.',
                );
              const errors = validateSuppliedIdentity(
                snapshot,
                registered!.suppliedParty,
              );
              if (errors.length) throw new ConflictException(errors);
            }
          }
          const [scene] = await tx
            .select()
            .from(adventureScenes)
            .where(eq(adventureScenes.sessionId, id));
          const position = !scene ? await spatialState(imported, tx) : null;
          const sceneKey = imported.definition.sessions.find(
            (s) => s.number === current.sessionNumber,
          )?.sceneKeys[0];
          if (
            openingRequested &&
            (!sceneKey ||
              (openingSource?.source === 'APPROVED_TEXT' &&
                openingSource.sceneKey !== sceneKey) ||
              (scene && (scene.sceneKey !== sceneKey || release)) ||
              (!scene && position?.current))
          )
            throw new ConflictException(
              'A abertura original não corresponde à preparação desta campanha.',
            );
          if (!scene && position?.current) {
            const previous = await this.repository.atNumber(
              campaignId,
              current.sessionNumber - 1,
              tx,
            );
            const [plan] = previous
              ? await tx
                  .select()
                  .from(sessionPlans)
                  .where(eq(sessionPlans.sessionId, previous.id))
              : [];
            await tx
              .insert(sessionPlans)
              .values({
                campaignId,
                sessionId: id,
                plan: scenePlanSchema.parse({
                  opening: imported.definition.locations.find(
                    (l) => l.key === position.current,
                  )!.description,
                  presentCharacterIds: plan?.plan.presentCharacterIds ?? [
                    imported.instance.protagonistId,
                  ],
                  options: [],
                  objectives: [],
                }),
              })
              .onConflictDoNothing();
          } else if (!scene) {
            if (!sceneKey)
              throw new ConflictException(
                'Adventure has no initial scene for this chapter',
              );
            await prepareAdventureScene(
              imported,
              current,
              sceneKey,
              tx,
              this.adventures,
            );
          }
          await activateAdventureScene(campaignId, id, tx, this.adventures);
        }
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
      if (openingRequested) {
        const { context } = await adventureContext(
          campaignId,
          id,
          tx,
          this.adventures,
        );
        let authored: string | undefined;
        if (openingSource?.source === 'APPROVED_TEXT' && imported) {
          const protagonistId = imported.instance.protagonistId!;
          const selection = await guidedParty(campaignId, tx);
          const cast = await tx
            .select()
            .from(characters)
            .where(
              and(
                eq(characters.campaignId, campaignId),
                inArray(characters.id, [
                  protagonistId,
                  ...(selection?.companionIds ?? []),
                ]),
              ),
            );
          const protagonist = cast.find(
            (member) => member.id === protagonistId,
          );
          if (!protagonist)
            throw new ConflictException(
              'Protagonista confirmada é necessária.',
            );
          authored = openingSource.text.replace(
            '{{nome_da_personagem}}',
            () => protagonist.name,
          );
          const scene = imported.definition.scenes.find(
            (entry) => entry.key === openingSource.sceneKey,
          )!;
          const locationId = adventureEntityId(
            campaignId,
            scene.locationKey,
            imported.instance.entityNamespace,
          );
          if (openingSource.planningRevision)
            for (const member of cast)
              await registerHorse(
                {
                  campaignId,
                  id: adventureEntityId(
                    campaignId,
                    `mount-${member.id}`,
                    imported.instance.entityNamespace,
                  ),
                  riderId: member.id,
                  riderName: member.name,
                  locationId,
                },
                tx,
              );
        }
        const opening =
          context?.publicOpening &&
          (openingSource?.source === 'APPROVED_TEXT'
            ? authored
            : context.publicOpening);
        if (!opening || (await this.messages.lastSequence(id, tx)))
          throw new ConflictException(
            'A abertura não pôde ser publicada com segurança.',
          );
        const confirmed = { narrative: opening, eventIds: [] };
        const validation = validateRendering(confirmed, confirmed, {
          category: 'OBSERVE',
          protagonist: null,
          speaker: null,
          scene: null,
          facts: [],
          rules: [],
        });
        if (!validation.accepted)
          throw new ConflictException(
            'A abertura não pôde ser validada. Tente iniciar a sessão novamente.',
          );
        await publishNarration(
          this.messages,
          tx,
          { campaignId, sessionId: id },
          validation.narration,
          {
            renderingValidation: 'ACCEPTED',
            ...(authored ? { travelOpening: true } : {}),
            ...(release
              ? {
                  openingRevision:
                    openingSource?.revision ?? 'canonical-scene-v1',
                }
              : {}),
          },
        );
      }
      if (action === 'complete') {
        if (terminal || current.sessionNumber === campaign.plannedSessions) {
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
          if (!release || release.releasedSessions.includes(next.sessionNumber))
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
