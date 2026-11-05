import { lockExecutionIdentity } from '../../../campaigns/execution-lock';
import { librarySessionResets } from '../../../database/library-schema';
import { guidedParty, recordGuidedParty } from '../state/guided-party';
import { randomUUID } from 'node:crypto';
import { setPassage } from '../navigation/spatial';
import { importAdventure } from '../definitions/import';
import { directorState } from '../director/director';
import { evaluateCondition } from '../director/progression';
import {
  Injectable,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  createCharacterSchema,
  DiceVisibility,
  storyCardDialogueManifestSchema,
} from '@solo-rpg/shared-contracts';
import {
  DatabaseService,
  type DatabaseTransaction,
} from '../../../database/database.service';
import * as a from '../../../database/adventure-schema';
import * as g from '../../../database/game-schema';
import {
  campaigns,
  campaignSessions,
  sessionMessages,
} from '../../../database/schema';
import {
  sessionPlans,
  narrativeActions,
  characterKnowledge,
} from '../../../database/narrative-schema';
import {
  adventureEntityId,
  digest,
  loadAdventure,
  sheetSnapshot,
} from '../state/state';
import {
  guidedReviewNote,
  interactiveReviewNote,
  validateAdventureParty,
  validateSuppliedIdentity,
} from './party-validation';
import { reviewSheets } from './review-sheets';
import { parseInput } from '../../../game-engine/validation';
import { GameEngineService } from '../../../game-engine/game-engine.service';
import {
  AdventureRegistry,
  type AdventureModuleDefinition,
  type PartySnapshot,
} from '../registry/registry';
import { prepareAdventureScene } from '../scenes/execution';

const reason = z.string().trim().min(10).max(3000);
export const adventureCommandSchema = z.discriminatedUnion('operation', [
  z.strictObject({
    operation: z.literal('IMPORT'),
    adventureId: z.string().min(1).max(100).optional(),
    version: z.number().int().min(1).optional(),
    campaignId: z.uuid(),
    commandId: z.uuid(),
  }),
  z.strictObject({ operation: z.literal('STATUS'), campaignId: z.uuid() }),
  z.strictObject({
    operation: z.literal('TRANSCRIBE_SUPPLIED_PARTY'),
    campaignId: z.uuid(),
    commandId: z.uuid(),
    confirmSourceTranscription: z.literal(true),
  }),
  z.strictObject({
    operation: z.literal('REVIEW_PARTY'),
    campaignId: z.uuid(),
    commandId: z.uuid(),
    expectedDigest: z.string().regex(/^[a-f0-9]{64}$/),
    sourceReview: reason,
    manualRulesAccepted: z.literal(true),
  }),
  z.strictObject({
    operation: z.literal('SCENE'),
    storyCardDialogue: storyCardDialogueManifestSchema.nullable().optional(),
    campaignId: z.uuid(),
    commandId: z.uuid(),
    sessionId: z.uuid(),
    sceneKey: z.string().min(1).max(100),
    reason,
    presentCompanionIds: z.array(z.uuid()).max(5).optional(),
  }),
  z.strictObject({
    operation: z.literal('ADJUDICATE'),
    campaignId: z.uuid(),
    commandId: z.uuid(),
    sessionId: z.uuid(),
    encounterKey: z.string().min(1).max(100),
    reason,
    publicSummary: reason,
    evidenceEventIds: z.array(z.uuid()).max(40),
    witnessKeys: z.array(z.string().max(100)).max(20),
    partyWitnessIds: z.array(z.uuid()).max(6).default([]),
    castUpdates: z
      .array(z.strictObject({ key: z.string().max(100), currentState: reason }))
      .max(20)
      .default([]),
  }),
  z.strictObject({
    operation: z.literal('CONFIRM_PASSAGE'),
    campaignId: z.uuid(),
    commandId: z.uuid(),
    sessionId: z.uuid(),
    passage: z.string().min(1).max(100),
    open: z.boolean(),
    confirmedInPlay: z.literal(true),
    reason,
  }),
  z.strictObject({
    operation: z.literal('CONFIRM_REVELATION'),
    campaignId: z.uuid(),
    commandId: z.uuid(),
    sessionId: z.uuid(),
    revelation: z.string(),
    confirmedInPlay: z.literal(true),
    reason,
  }),
  z.strictObject({
    operation: z.literal('CONFIRM_CAST_PRESENCE'),
    campaignId: z.uuid(),
    commandId: z.uuid(),
    sessionId: z.uuid(),
    characterKey: z.string().min(1).max(100),
    present: z.boolean(),
    canSpeak: z.boolean(),
    confirmedInPlay: z.literal(true),
    reason,
  }),
  z.strictObject({
    operation: z.literal('CONFIRM_FACT'),
    campaignId: z.uuid(),
    commandId: z.uuid(),
    sessionId: z.uuid(),
    factKey: z.string().min(1).max(100),
    reason,
    evidenceEventIds: z.array(z.uuid()).min(1).max(40),
  }),
  z.strictObject({
    operation: z.literal('REVIEW_SESSION'),
    campaignId: z.uuid(),
    commandId: z.uuid(),
    sessionId: z.uuid(),
    reason,
    evidenceEventIds: z.array(z.uuid()).min(1).max(40),
  }),
]);

@Injectable()
export class AdventureService {
  constructor(
    private readonly database: DatabaseService,
    private readonly engine: GameEngineService,
    private readonly registry: AdventureRegistry,
  ) {}
  async prepareParty(campaignId: string) {
    await this.execute(
      {
        operation: 'TRANSCRIBE_SUPPLIED_PARTY',
        campaignId,
        commandId: randomUUID(),
        confirmSourceTranscription: true,
      },
      true,
    );
  }

  async confirmParty(campaignId: string, raw: unknown) {
    const { revision, companions } = parseInput(
      z.strictObject({
        revision: z.string().regex(/^[a-f0-9]{64}$/),
        confirmed: z.literal(true),
        companions: z.array(z.string().min(1).max(100)).max(3).optional(),
      }),
      raw,
    );
    await this.execute(
      {
        operation: 'REVIEW_PARTY',
        campaignId,
        commandId: randomUUID(),
        expectedDigest: revision,
        sourceReview: (await this.registry.guidedRelease(
          campaignId,
          this.database.db,
        ))
          ? guidedReviewNote
          : interactiveReviewNote,
        manualRulesAccepted: true,
      },
      true,
      companions,
    );
  }

  async preparation(campaignId: string) {
    return this.database.db.transaction(
      async (tx) => {
        const [campaign] = await tx
          .select({ status: campaigns.status })
          .from(campaigns)
          .where(eq(campaigns.id, campaignId));
        if (!campaign) throw new NotFoundException('Campanha não encontrada.');
        const loaded = await loadAdventure(campaignId, tx);
        if (!loaded) return null;
        const { definition, instance } = loaded;
        const module = this.registry.forDefinition(definition);
        const adventure = {
          title: definition.title,
          version: definition.version,
        };
        const release = await this.registry.guidedRelease(campaignId, tx);
        const selection = release ? await guidedParty(campaignId, tx) : null;
        const companions = (module.suppliedParty ?? []).flatMap((member) =>
          release?.companions[member.key]
            ? [
                {
                  key: member.key,
                  name: member.sheet.name,
                  people: member.sheet.people,
                  ...release.companions[member.key],
                },
              ]
            : [],
        );
        if (release && campaign.status !== 'DRAFT') {
          const snapshot = await sheetSnapshot(campaignId, tx);
          return {
            ...adventure,
            available: false as const,
            guided: true,
            companions,
            selectedCompanions: selection?.keys ?? null,
            sheets: await reviewSheets(
              {
                ...snapshot,
                cast: snapshot.cast.filter(
                  (c) => c.id === instance.protagonistId,
                ),
              },
              module.suppliedParty,
              tx,
            ),
          };
        }
        if (!module.interactivePreparation || campaign.status !== 'DRAFT')
          return { ...adventure, available: false as const };

        const snapshot = await sheetSnapshot(campaignId, tx);
        const [existing] = await tx
          .select({ id: g.characters.id })
          .from(g.characters)
          .where(eq(g.characters.campaignId, campaignId))
          .limit(1);
        const revision = digest(snapshot);
        const errors = existing
          ? this.interactivePartyErrors(snapshot, module)
          : [];
        const linked = snapshot.cast.some(
          (c) => c.id === instance.protagonistId && c.kind === 'PROTAGONIST',
        );
        const digestMatches = instance.reviewedDigest === revision;
        // A previously reviewed adaptation can still use the original session workflow.
        if (
          errors.length &&
          linked &&
          digestMatches &&
          instance.reviewNotes !== interactiveReviewNote
        )
          return { ...adventure, available: false as const };
        return {
          ...adventure,
          available: true as const,
          needsParty: !existing,
          revision,
          reviewed:
            !errors.length &&
            linked &&
            digestMatches &&
            instance.reviewNotes ===
              (release ? guidedReviewNote : interactiveReviewNote),
          errors,
          ...(release
            ? {
                guided: true,
                companions,
                selectedCompanions: selection?.keys ?? null,
              }
            : {}),
          sheets: await reviewSheets(
            release
              ? {
                  ...snapshot,
                  cast: snapshot.cast.filter((c) => c.kind === 'PROTAGONIST'),
                }
              : snapshot,
            module.suppliedParty,
            tx,
          ),
        };
      },
      { isolationLevel: 'repeatable read', accessMode: 'read only' },
    );
  }

  private interactivePartyErrors(
    snapshot: PartySnapshot,
    module: AdventureModuleDefinition,
  ) {
    if (snapshot.cast.some((c) => !c.known))
      return ['A campanha contém fichas indisponíveis para conferência.'];
    return [
      ...validateAdventureParty(snapshot, module.definition).errors,
      ...(module.validateParty?.(snapshot) ?? []),
      ...validateSuppliedIdentity(snapshot, module.suppliedParty),
    ];
  }

  async execute(raw: unknown, interactive = false, companionKeys?: string[]) {
    const generic = adventureCommandSchema.safeParse(raw);
    const specific = generic.success
      ? null
      : parseInput(
          z
            .object({
              operation: z.string(),
              campaignId: z.uuid(),
              commandId: z.uuid(),
              sessionId: z.uuid(),
            })
            .passthrough(),
          raw,
        );
    const input = generic.success
      ? generic.data
      : {
          operation: 'ADVENTURE_COMMAND' as const,
          campaignId: specific!.campaignId,
          commandId: specific!.commandId,
          sessionId: specific!.sessionId,
          payload: raw,
          localOperation: specific!.operation,
        };
    const selection =
      input.operation === 'IMPORT'
        ? this.registry.forImport(input.adventureId, input.version)
        : null;
    if (input.operation === 'STATUS') return this.status(input.campaignId);
    const result = await this.database.db.transaction(async (tx) => {
      if (input.operation === 'IMPORT') {
        await lockExecutionIdentity(input.campaignId, tx);
        const [retired] = await tx
          .select({ sequence: librarySessionResets.sequence })
          .from(librarySessionResets)
          .where(eq(librarySessionResets.previousCampaignId, input.campaignId));
        if (retired)
          throw new NotFoundException('Esta execução foi descartada.');
        await tx
          .insert(campaigns)
          .values({
            id: input.campaignId,
            title: selection!.definition.title,
            description: selection!.definition.synopsis,
            plannedSessions: selection!.definition.sessions.length,
          })
          .onConflictDoNothing();
      }
      const [campaign] = await tx
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.campaignId))
        .for('update');
      if (!campaign) throw new NotFoundException('Campaign not found');
      if (interactive) {
        const loaded = await loadAdventure(campaign.id, tx);
        if (
          !loaded ||
          !this.registry.forDefinition(loaded.definition).interactivePreparation
        )
          throw new ConflictException(
            'A preparação pela interface não está disponível para esta aventura.',
          );
      }
      const localInstance =
        input.operation === 'ADVENTURE_COMMAND'
          ? await loadAdventure(campaign.id, tx)
          : null;
      const localModule = localInstance
        ? this.registry.forDefinition(localInstance.definition)
        : null;
      if (
        input.operation === 'ADVENTURE_COMMAND' &&
        !localModule?.commandSchema
      )
        throw new BadRequestException('Unsupported adventure command');
      const localCommand =
        input.operation === 'ADVENTURE_COMMAND'
          ? parseInput(localModule!.commandSchema!, input.payload)
          : null;
      const hash = digest(localCommand ?? input);
      const [receipt] = await tx
        .select()
        .from(g.gameCommands)
        .where(
          and(
            eq(g.gameCommands.campaignId, input.campaignId),
            eq(g.gameCommands.commandId, input.commandId),
          ),
        );
      if (receipt) {
        if (receipt.digest !== hash)
          throw new ConflictException(
            'Command key reused with different input',
          );
        return receipt.result;
      }
      const [pending] = await tx
        .select()
        .from(narrativeActions)
        .where(
          and(
            eq(narrativeActions.campaignId, campaign.id),
            sql`${narrativeActions.status} NOT IN ('COMPLETED','REJECTED')`,
          ),
        );
      if (pending)
        throw new ConflictException('Resolve pending narrative action first');
      const [combat] = await tx
        .select()
        .from(g.combatEncounters)
        .where(
          and(
            eq(g.combatEncounters.campaignId, campaign.id),
            eq(g.combatEncounters.status, 'ACTIVE'),
          ),
        );
      if (combat) throw new ConflictException('Resolve active combat first');
      let result: Record<string, unknown>;
      if (input.operation === 'IMPORT')
        result = await importAdventure(
          campaign.id,
          campaign.status,
          selection!.definition,
          selection!.entityNamespace,
          tx,
        );
      else if (input.operation === 'TRANSCRIBE_SUPPLIED_PARTY') {
        const [existing] = await tx
          .select()
          .from(g.characters)
          .where(eq(g.characters.campaignId, campaign.id))
          .limit(1);
        if (existing && interactive)
          return { id: campaign.id, transcribed: false };
        if (campaign.status !== 'DRAFT')
          throw new ConflictException(
            'Transcribe supplied profiles only into an empty draft',
          );
        if (existing)
          throw new ConflictException(
            'Existing characters are preserved; bind and review them instead',
          );
        const loaded = await loadAdventure(campaign.id, tx);
        if (!loaded) throw new NotFoundException('Import the adventure first');
        const module = this.registry.forDefinition(loaded.definition);
        if (!module.suppliedParty)
          throw new BadRequestException('No supplied party for this adventure');
        for (const member of module.suppliedParty) {
          const commandId = adventureEntityId(
            campaign.id,
            `transcribe-${member.key}`,
            module.entityNamespace,
          );
          const created = await this.engine.executeLocalInTransaction(
            {
              campaignId: campaign.id,
              commandId,
              command: {
                type: 'CHARACTER_CREATE',
                sheet: createCharacterSchema.parse({
                  ...member.sheet,
                  commandId,
                }),
                kind: member.kind,
                known: true,
                living: true,
                personality: member.personality,
                motivations: member.motivations,
                state: member.initialState ?? '',
                privateNotes: [
                  `Fonte fornecida pela jogadora: ${member.source}. Validar antes de jogar.`,
                  member.privateNotes,
                ]
                  .filter(Boolean)
                  .join(' '),
                privateObjectives: '',
              },
            },
            tx,
          );
          await this.engine.executeLocalInTransaction(
            {
              campaignId: campaign.id,
              commandId: adventureEntityId(
                campaign.id,
                `profile-${member.key}`,
                module.entityNamespace,
              ),
              command: {
                type: 'COMBAT_CONFIGURE',
                characterId: created.id,
                armorType: member.armor,
                armorTrained: member.armor !== 'NONE',
                shieldType: member.shield,
                shieldTrained: member.shield !== 'NONE',
                baseSpeed: 10,
                weaponTraining: member.weaponTraining
                  ? [...member.weaponTraining]
                  : member.sheet.characterClass === 'EXPERT'
                    ? ['staff', 'shortbow', 'longbow', 'sling', 'light-blade']
                    : member.sheet.characterClass === 'WARRIOR'
                      ? [
                          'heavy-blade',
                          'staff',
                          'shortbow',
                          'longbow',
                          'sling',
                          'light-blade',
                        ]
                      : ['staff'],
                reason: `Transcrição de ${member.source}; sem certificação de legalidade.`,
              },
            },
            tx,
          );
          const itemId = (
            await this.engine.executeLocalInTransaction(
              {
                campaignId: campaign.id,
                commandId: adventureEntityId(
                  campaign.id,
                  `weapon-${member.key}`,
                  module.entityNamespace,
                ),
                command: {
                  type: 'ITEM_CREATE',
                  name: member.weaponName ?? `Arma de ${member.sheet.name}`,
                  description:
                    'Arma mundana transcrita da ficha; sem propriedades arcanas.',
                  consumable: false,
                  equipmentRuleId: member.weapon,
                  visibility: DiceVisibility.PUBLIC,
                },
              },
              tx,
            )
          ).id;
          await this.engine.executeLocalInTransaction(
            {
              campaignId: campaign.id,
              commandId: adventureEntityId(
                campaign.id,
                `grant-${member.key}`,
                module.entityNamespace,
              ),
              command: {
                type: 'ITEM_GRANT',
                characterId: created.id,
                itemId,
                quantity: 1,
                reason: 'Equipamento inicial da ficha fornecida.',
              },
            },
            tx,
          );
          await tx
            .update(g.inventory)
            .set({ equipped: true })
            .where(
              and(
                eq(g.inventory.characterId, created.id),
                eq(g.inventory.itemId, itemId),
              ),
            );
          await this.event(
            input,
            'SUPPLIED_EQUIPMENT_TRANSCRIBED',
            'Equipamento inicial conferido na ficha-fonte.',
            'GM_ONLY',
            { characterId: created.id, itemId, equipped: true },
            tx,
          );
        }
        result = {
          id: campaign.id,
          transcribed: module.suppliedParty.length,
          reviewed: false,
        };
      } else {
        const loaded = await loadAdventure(campaign.id, tx);
        if (!loaded) throw new NotFoundException('Import the adventure first');
        const module = this.registry.forDefinition(loaded.definition);
        module.assertIdle?.(
          loaded.instance.mechanics,
          input.operation === 'ADVENTURE_COMMAND'
            ? input.localOperation
            : input.operation,
        );
        if (input.operation === 'ADVENTURE_COMMAND') {
          if (!module.commandSchema || !module.executeCommand)
            throw new BadRequestException('Unsupported adventure command');
          const command = localCommand!;
          result = await this.engine.executeAdventureLocalInTransaction(
            command,
            campaign.id,
            tx,
            (type, description, visibility, changes) =>
              this.event(input, type, description, visibility, changes, tx),
          );
        } else if (input.operation === 'REVIEW_PARTY') {
          const release = await this.registry.guidedRelease(campaign.id, tx);
          const chosen = companionKeys && [...new Set(companionKeys)].sort();
          if (
            interactive &&
            (!!release !== !!chosen ||
              chosen?.some((key) => !Object.hasOwn(release!.companions, key)) ||
              (chosen && chosen.length !== companionKeys!.length))
          )
            throw new BadRequestException(
              'Confirme os companheiros disponíveis para esta aventura.',
            );
          const selection =
            release && interactive ? await guidedParty(campaign.id, tx) : null;
          if (selection && digest(selection.keys) !== digest(chosen))
            throw new ConflictException(
              'A composição inicial já foi confirmada.',
            );

          if (
            interactive &&
            loaded.instance.reviewNotes === input.sourceReview &&
            loaded.instance.reviewedDigest === input.expectedDigest &&
            campaign.status !== 'DRAFT'
          )
            return { reviewed: true };
          if (campaign.status !== 'DRAFT')
            throw new ConflictException(
              'A conferência inicial só pode ser feita antes de começar.',
            );
          const snapshot = await sheetSnapshot(campaign.id, tx);
          if (interactive && digest(snapshot) !== input.expectedDigest)
            throw new ConflictException(
              'As fichas mudaram. Confira a versão atual e confirme novamente.',
            );
          const errors = interactive
            ? this.interactivePartyErrors(snapshot, module)
            : [
                ...validateAdventureParty(snapshot, loaded.definition).errors,
                ...(module.validateParty?.(snapshot) ?? []),
              ];
          if (errors.length) throw new BadRequestException(errors);
          if (!interactive && digest(snapshot) !== input.expectedDigest)
            throw new ConflictException(
              'Sheet changed; inspect current report',
            );
          const pc = snapshot.cast.find((c) => c.kind === 'PROTAGONIST')!;
          if (
            interactive &&
            loaded.instance.protagonistId &&
            loaded.instance.protagonistId !== pc.id
          )
            throw new ConflictException(
              'A protagonista vinculada não corresponde à ficha fornecida.',
            );
          if (release && chosen && !selection) {
            const companionIds = chosen.map((key) => {
              const member = module.suppliedParty!.find(
                (entry) => entry.key === key,
              )!;
              return snapshot.cast.find(
                (c) => c.kind === 'COMPANION' && c.name === member.sheet.name,
              )!.id;
            });
            await recordGuidedParty(
              campaign.id,
              { keys: chosen, companionIds },
              tx,
            );
          }
          if (
            interactive &&
            loaded.instance.protagonistId === pc.id &&
            loaded.instance.reviewNotes === input.sourceReview &&
            loaded.instance.reviewedDigest === input.expectedDigest
          )
            return { reviewed: true };
          await tx
            .update(a.adventureInstances)
            .set({
              protagonistId: pc.id,
              reviewedDigest: input.expectedDigest,
              reviewNotes: input.sourceReview,
            })
            .where(eq(a.adventureInstances.campaignId, campaign.id));
          await this.event(
            input,
            'ADVENTURE_PARTY_REVIEWED',
            input.sourceReview,
            'GM_ONLY',
            { protagonistId: pc.id, sheetDigest: input.expectedDigest },
            tx,
          );
          result = {
            id: pc.id,
            reviewed: true,
            automation: 'PARTIAL_WITH_LOCAL_ADJUDICATION',
          };
        } else {
          const [session] = await tx
            .select()
            .from(campaignSessions)
            .where(
              and(
                eq(campaignSessions.id, input.sessionId),
                eq(campaignSessions.campaignId, campaign.id),
              ),
            )
            .for('update');
          if (
            !session ||
            !['AVAILABLE', 'LOCKED', 'IN_PROGRESS'].includes(session.status)
          )
            throw new ConflictException('Session unavailable');
          if (input.operation === 'CONFIRM_PASSAGE') {
            if (
              session.status !== 'IN_PROGRESS' ||
              !(await setPassage(
                loaded,
                session.id,
                input.commandId,
                input.passage,
                input.open,
                input.reason,
                tx,
              ))
            )
              throw new BadRequestException(
                'Confirm an eligible passage at the current location',
              );
            result = { id: session.id, confirmed: true };
          } else if (
            input.operation === 'CONFIRM_REVELATION' ||
            input.operation === 'CONFIRM_CAST_PRESENCE'
          ) {
            if (
              !module.scenePolicy?.confirm ||
              session.status !== 'IN_PROGRESS'
            )
              throw new ConflictException(
                'Narrative confirmation requires an active integrity-enabled adventure',
              );
            const [runtime] = await tx
              .select()
              .from(a.adventureScenes)
              .where(eq(a.adventureScenes.sessionId, session.id));
            const scene = loaded.definition.scenes.find(
              (s) => s.key === runtime?.sceneKey,
            );
            if (!scene)
              throw new ConflictException('Prepare the source scene first');
            result = await module.scenePolicy.confirm(
              input,
              loaded,
              scene,
              tx,
              (type, description, visibility, changes) =>
                this.event(input, type, description, visibility, changes, tx),
            );
          } else if (input.operation === 'CONFIRM_FACT') {
            if (session.status !== 'IN_PROGRESS')
              throw new ConflictException(
                'Fact confirmation requires an active session',
              );
            const localFacts =
              loaded.planning?.sessions[session.sessionNumber - 1]?.operational
                ?.localFacts ?? [];
            const facts = [
              ...(loaded.definition.progression?.facts ?? []),
              ...localFacts,
            ];
            const localFact = localFacts.find((f) => f.key === input.factKey);
            const fact = facts.find((f) => f.key === input.factKey);
            const state = await directorState(loaded, session.id, tx);
            if (!fact || !state || fact.unitKey !== state.unit.key)
              throw new BadRequestException('Unknown fact for this unit');
            const prior = state.evidence.find((e) => e.fact === fact.key);
            if (prior) {
              result = { id: prior.id, confirmed: false };
            } else {
              if (
                fact.requires &&
                !evaluateCondition(fact.requires, state.evidence).satisfied
              )
                throw new ConflictException(
                  'Fact prerequisites lack official evidence',
                );
              if (
                fact.exclusiveGroup &&
                facts.some(
                  (f) =>
                    f.key !== fact.key &&
                    f.exclusiveGroup === fact.exclusiveGroup &&
                    state.evidence.some((e) => e.fact === f.key),
                )
              )
                throw new ConflictException('Conflicting official outcomes');
              const ids = [...new Set(input.evidenceEventIds)];
              const proof = await tx
                .select()
                .from(g.gameEvents)
                .where(
                  and(
                    eq(g.gameEvents.campaignId, campaign.id),
                    eq(g.gameEvents.sessionId, session.id),
                    inArray(g.gameEvents.id, ids),
                  ),
                );
              if (proof.length !== ids.length)
                throw new BadRequestException(
                  'Evidence must belong to this campaign and session',
                );
              if (
                localFact &&
                !proof.some(
                  (event) =>
                    event.visibility !== 'GM_ONLY' &&
                    localFact.proofTypes.includes(event.type),
                )
              )
                throw new BadRequestException(
                  'O objetivo exige um acontecimento narrativo confirmado nesta sessão.',
                );
              // Explicit local adjudication, never a player/LLM capability. Private by construction.
              const event = await this.event(
                input,
                'NARRATIVE_FACT_CONFIRMED',
                input.reason,
                'GM_ONLY',
                {
                  factKey: fact.key,
                  definitionId: loaded.instance.definitionId,
                  evidenceEventIds: ids,
                  sourcePages: fact.sourcePages,
                  ...(localFact && {
                    planningRevision: loaded.planning!.revision,
                  }),
                },
                tx,
              );
              result = { id: event.id, confirmed: true };
            }
          } else if (input.operation === 'SCENE') {
            const scene = loaded.definition.scenes.find(
              (s) => s.key === input.sceneKey,
            );
            if (!scene) throw new BadRequestException('Unknown source scene');
            const [review] = await tx
              .select()
              .from(a.adventureReviews)
              .where(eq(a.adventureReviews.sessionId, session.id));
            if (review)
              throw new ConflictException(
                'Session already reviewed; finish or carry pending scenes to the next chapter',
              );
            await prepareAdventureScene(
              loaded,
              session,
              scene.key,
              tx,
              this.registry,
              input.presentCompanionIds,
              input.storyCardDialogue,
            );
            await this.event(
              input,
              'ADVENTURE_SCENE_PREPARED',
              input.reason,
              'GM_ONLY',
              {
                sceneKey: scene.key,
                sourcePages: loaded.definition.encounters.find(
                  (e) => e.key === scene.encounterKey,
                )!.sourcePages,
              },
              tx,
            );
            result = {
              id: session.id,
              sceneKey: scene.key,
              requiresAdjudication:
                loaded.definition.encounters.find(
                  (e) => e.key === scene.encounterKey,
                )!.blockers.length > 0,
            };
          } else {
            if (session.status !== 'IN_PROGRESS')
              throw new ConflictException(
                'Adjudication requires an active session',
              );
            const ids = [...new Set(input.evidenceEventIds)];
            const events = ids.length
              ? await tx
                  .select()
                  .from(g.gameEvents)
                  .where(
                    and(
                      eq(g.gameEvents.campaignId, campaign.id),
                      eq(g.gameEvents.sessionId, session.id),
                      inArray(g.gameEvents.id, ids),
                      inArray(g.gameEvents.type, [
                        ...(module.publicEventTypes ?? []),
                        'ABILITY_CHECK',
                        'DAMAGE_APPLIED',
                        'CONSEQUENCE_RECORDED',
                        'LOCATION_UPDATED',
                        'RELATIONSHIP_CHANGED',
                        'ARCANA_RESOLVED',
                      ]),
                    ),
                  )
              : [];
            if (events.length !== ids.length)
              throw new BadRequestException(
                'Evidence must be confirmed events from this campaign and session',
              );
            if (input.operation === 'REVIEW_SESSION') {
              if (loaded.definition.progression)
                throw new ConflictException(
                  'Use explicit narrative facts for this version',
                );
              const [existing] = await tx
                .select()
                .from(a.adventureReviews)
                .where(eq(a.adventureReviews.sessionId, session.id));
              if (existing)
                throw new ConflictException('Session already reviewed');
              await tx.insert(a.adventureReviews).values({
                campaignId: campaign.id,
                sessionId: session.id,
                sessionNumber: session.sessionNumber,
                eventIds: ids,
                reason: input.reason,
              });
              await this.event(
                input,
                'ADVENTURE_SESSION_REVIEWED',
                input.reason,
                'GM_ONLY',
                {
                  evidenceEventIds: ids,
                  completionCriteria:
                    loaded.definition.sessions[session.sessionNumber - 1]!
                      .completionCriteria,
                },
                tx,
              );
              result = { id: session.id, reviewed: true };
            } else {
              const [runtime] = await tx
                .select()
                .from(a.adventureScenes)
                .where(eq(a.adventureScenes.sessionId, session.id));
              const scene = loaded.definition.scenes.find(
                (s) => s.key === runtime?.sceneKey,
              );
              if (scene?.encounterKey !== input.encounterKey)
                throw new ConflictException(
                  'Adjudicate only the current source encounter',
                );
              const integrity = await module.scenePolicy?.read(loaded, tx);
              const isPresent = (key: string) =>
                integrity
                  ? integrity.presence(scene, key).present
                  : scene.characterKeys.includes(key);
              if (input.witnessKeys.some((key) => !isPresent(key)))
                throw new BadRequestException('Witness must be present');
              if (input.castUpdates.some((u) => !isPresent(u.key)))
                throw new BadRequestException(
                  'State updates require a present source character',
                );
              const [plan] = await tx
                .select()
                .from(sessionPlans)
                .where(eq(sessionPlans.sessionId, session.id));
              if (
                input.partyWitnessIds.some(
                  (id) => !plan?.plan.presentCharacterIds.includes(id),
                )
              )
                throw new BadRequestException('Party witness must be present');
              if (
                [
                  ...input.witnessKeys,
                  ...input.castUpdates.map((u) => u.key),
                ].some(
                  (key) =>
                    loaded.definition.characters.find(
                      (card) => card.key === key,
                    )?.identityKind !== 'INDIVIDUAL',
                )
              )
                throw new BadRequestException(
                  'Archetypes have no shared individual memory; instantiate and adjudicate each NPC separately',
                );
              const event = await this.event(
                input,
                'CONSEQUENCE_RECORDED',
                input.publicSummary,
                'PUBLIC',
                { origin: 'LOCAL_ADJUDICATION' },
                tx,
              );
              const [lastMessage] = await tx
                .select({ sequence: max(sessionMessages.sequenceNumber) })
                .from(sessionMessages)
                .where(eq(sessionMessages.sessionId, session.id));
              await tx.insert(sessionMessages).values({
                campaignId: campaign.id,
                sessionId: session.id,
                role: 'SYSTEM',
                content: input.publicSummary,
                sequenceNumber: (lastMessage?.sequence ?? 0) + 1,
                metadata: { eventId: event.id, origin: 'LOCAL_ADJUDICATION' },
              });
              await this.event(
                input,
                'ADVENTURE_ADJUDICATION',
                input.reason,
                'GM_ONLY',
                {
                  encounterKey: scene.encounterKey,
                  sourcePages: loaded.definition.encounters.find(
                    (e) => e.key === scene.encounterKey,
                  )!.sourcePages,
                  evidenceEventIds: ids,
                  publicEventId: event.id,
                },
                tx,
              );
              for (const key of new Set(input.witnessKeys))
                await tx
                  .insert(a.adventureMemories)
                  .values({
                    campaignId: campaign.id,
                    characterKey: key,
                    eventId: event.id,
                  })
                  .onConflictDoNothing();
              for (const update of input.castUpdates)
                await tx
                  .update(a.adventureCast)
                  .set({ currentState: update.currentState })
                  .where(
                    and(
                      eq(a.adventureCast.campaignId, campaign.id),
                      eq(a.adventureCast.key, update.key),
                    ),
                  );
              for (const characterId of new Set(input.partyWitnessIds))
                await tx
                  .insert(characterKnowledge)
                  .values({
                    campaignId: campaign.id,
                    characterId,
                    eventId: event.id,
                    source: 'LOCAL_ATTESTED',
                    importance: 70,
                  })
                  .onConflictDoNothing();
              result = { id: event.id, adjudicated: true };
            }
          }
        }
      }
      await tx.insert(g.gameCommands).values({
        campaignId: campaign.id,
        commandId: input.commandId,
        digest: hash,
        result,
      });
      return result;
    });
    return result;
  }
  private async event(
    input: { campaignId: string; sessionId?: string; commandId: string },
    type: string,
    description: string,
    visibility: 'PUBLIC' | 'GM_ONLY',
    changes: Record<string, unknown>,
    tx: DatabaseTransaction,
  ) {
    const [last] =
      visibility === 'PUBLIC'
        ? await tx
            .select({ value: max(g.gameEvents.publicSequence) })
            .from(g.gameEvents)
            .where(eq(g.gameEvents.campaignId, input.campaignId))
        : [];
    const [event] = await tx
      .insert(g.gameEvents)
      .values({
        campaignId: input.campaignId,
        sessionId: input.sessionId,
        commandId: input.commandId,
        type,
        description,
        visibility,
        changes,
        publicSequence: visibility === 'PUBLIC' ? (last?.value ?? 0) + 1 : null,
      })
      .returning();
    return event!;
  }
  async status(campaignId: string) {
    const loaded = await loadAdventure(campaignId, this.database.db);
    if (!loaded) throw new NotFoundException('Adventure not imported');
    const snapshot = await sheetSnapshot(campaignId, this.database.db);
    const report = validateAdventureParty(snapshot, loaded.definition);
    report.errors.push(
      ...(this.registry
        .forDefinition(loaded.definition)
        .validateParty?.(snapshot) ?? []),
    );
    return {
      campaignId,
      source: loaded.definition.title,
      mechanics: loaded.instance.mechanics,
      narrativeMinutes: loaded.instance.narrativeMinutes,
      snapshotDigest: digest(snapshot),
      review: report,
      reviewed: loaded.instance.reviewedDigest === digest(snapshot),
      automation: 'PARTIAL_WITH_LOCAL_ADJUDICATION',
      encounters: loaded.definition.encounters.map((e) => ({
        key: e.key,
        sourcePages: e.sourcePages,
        blockers: e.blockers,
      })),
    };
  }
}
