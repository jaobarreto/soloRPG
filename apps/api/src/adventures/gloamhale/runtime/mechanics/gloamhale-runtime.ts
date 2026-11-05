import { guidedParty } from '../../../core/state/guided-party';
import { legacyEntityNamespace } from '../../default-adventure';
import {
  hasNarrativeIntegrity,
  integrityEventType,
} from '../state/narrative-integrity';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { abilities } from '@solo-rpg/shared-contracts';
import { and, eq, inArray, max } from 'drizzle-orm';
import type { DatabaseTransaction } from '../../../../database/database.service';
import * as a from '../../../../database/adventure-schema';
import * as g from '../../../../database/game-schema';
import { campaignSessions, sessionMessages } from '../../../../database/schema';
import {
  characterKnowledge,
  sessionPlans,
} from '../../../../database/narrative-schema';
import { BlueRoseDice } from '../../../../blue-rose/mechanics/dice/blue-rose-dice';
import { resolveBasicCheck } from '../../../../blue-rose/mechanics/tests/basic-check.rules';
import { armorRules } from '../../../../blue-rose/mechanics/combat/combat.rules';
import type { GloamhaleCommand } from '../commands/gloamhale-commands';
import {
  manorScores,
  ritualOutcome,
  type GloamhaleMechanics,
} from './gloamhale-mechanics';
import type { AdventureDefinition } from '../../../core/definitions/definition';
import { adventureEntityId, loadAdventure } from '../../../core/state/state';
import {
  detachSpatialEncounter,
  spatialArrival,
} from '../../../core/navigation/spatial';

type Emit = (
  type: string,
  description: string,
  visibility: 'PUBLIC' | 'GM_ONLY',
  changes: Record<string, unknown>,
) => Promise<typeof g.gameEvents.$inferSelect>;

// Called only by the local adventure adapter, under the campaign lock and receipt transaction.
export async function applyGloamhale(
  input: GloamhaleCommand,
  definition: AdventureDefinition,
  stored: GloamhaleMechanics | null,
  tx: DatabaseTransaction,
  dice: BlueRoseDice,
  emit: Emit,
) {
  const [session] = await tx
    .select()
    .from(campaignSessions)
    .where(
      and(
        eq(campaignSessions.id, input.sessionId),
        eq(campaignSessions.campaignId, input.campaignId),
      ),
    );
  if (session?.status !== 'IN_PROGRESS')
    throw new ConflictException('Active session required');
  const [runtime] = await tx
    .select()
    .from(a.adventureScenes)
    .where(eq(a.adventureScenes.sessionId, input.sessionId));
  const scene = definition.scenes.find((s) => s.key === runtime?.sceneKey);
  if (
    !scene &&
    !(
      definition.spatial &&
      [
        'GLOAMHALE_TIME',
        'GLOAMHALE_DAMAGE',
        'GLOAMHALE_MOVE',
        'GLOAMHALE_RETURN',
      ].includes(input.operation)
    )
  )
    throw new ConflictException('Prepare a source scene first');
  const [plan] = await tx
    .select()
    .from(sessionPlans)
    .where(eq(sessionPlans.sessionId, input.sessionId));
  const present = plan?.plan.presentCharacterIds ?? [];
  const state: GloamhaleMechanics = structuredClone(
    stored ?? { children: {}, stage: 0, elapsedMinutes: 0, nextChangeAt: null },
  );
  const eventIds: string[] = [];
  if (
    state.ritual?.pending &&
    !['GLOAMHALE_RITUAL_RESOLVE', 'GLOAMHALE_RITUAL_STOP'].includes(
      input.operation,
    )
  )
    throw new ConflictException('Resolve the pending ritual test first');
  const child = (id: string) => {
    const member = state.children[id];
    if (!member)
      throw new BadRequestException('Character is not in child form');
    return member;
  };
  const writeScores = async (id: string, scores: Record<string, number>) => {
    for (const ability of abilities)
      await tx
        .update(g.characterAbilities)
        .set({ score: scores[ability]! })
        .where(
          and(
            eq(g.characterAbilities.characterId, id),
            eq(g.characterAbilities.ability, ability),
          ),
        );
  };
  const announce = async (
    type: string,
    text: string,
    changes: Record<string, unknown>,
    participants: string[] = [],
  ) => {
    const event = await emit(type, text, 'PUBLIC', changes);
    eventIds.push(event.id);
    if (participants.length)
      await tx.insert(g.eventParticipants).values(
        [...new Set(participants)].map((characterId) => ({
          campaignId: input.campaignId,
          eventId: event.id,
          characterId,
        })),
      );
    for (const characterId of participants.filter((id) => present.includes(id)))
      await tx
        .insert(characterKnowledge)
        .values({
          campaignId: input.campaignId,
          characterId,
          eventId: event.id,
          source: 'WITNESSED',
          importance: 80,
        })
        .onConflictDoNothing();
    const [last] = await tx
      .select({ sequence: max(sessionMessages.sequenceNumber) })
      .from(sessionMessages)
      .where(eq(sessionMessages.sessionId, input.sessionId));
    await tx.insert(sessionMessages).values({
      campaignId: input.campaignId,
      sessionId: input.sessionId,
      role: 'SYSTEM',
      content: text,
      sequenceNumber: (last?.sequence ?? 0) + 1,
      metadata: { eventId: event.id, origin: 'GLOAMHALE_RULE' },
    });
    return event;
  };
  const damage = async (id: string, amount: number) => {
    const member = child(id);
    if (member.location !== 'MANOR')
      throw new ConflictException(
        'Manor damage requires a character inside the manor',
      );
    const [health] = await tx
      .select()
      .from(g.characterResources)
      .where(
        and(
          eq(g.characterResources.characterId, id),
          eq(g.characterResources.name, 'HEALTH'),
        ),
      );
    const [vitals] = await tx
      .select()
      .from(g.characterVitals)
      .where(eq(g.characterVitals.characterId, id));
    if (!health || health.current === 0 || vitals?.lifeState !== 'ALIVE')
      throw new ConflictException('Character cannot act');
    const transported = amount >= health.current;
    const current = transported ? 1 : health.current - amount;
    await tx
      .update(g.characterResources)
      .set({ current })
      .where(
        and(
          eq(g.characterResources.characterId, id),
          eq(g.characterResources.name, 'HEALTH'),
        ),
      );
    // No resurrection, fatigue clearing, or implicit Cure: the source exception affects Health only.
    if (transported) {
      member.location = 'GROTTO';
      await tx
        .update(g.worldEntities)
        .set({ visibility: 'PUBLIC', accessible: true })
        .where(
          and(
            eq(g.worldEntities.campaignId, input.campaignId),
            eq(
              g.worldEntities.id,
              adventureEntityId(
                input.campaignId,
                'grotto',
                legacyEntityNamespace,
              ),
            ),
          ),
        );
    }
    await announce(
      'DAMAGE_APPLIED',
      transported
        ? 'O corpo desaparece da mansão e desperta na gruta, ainda criança, estável com 1 de Saúde.'
        : `Dano confirmado na mansão: ${amount}; Saúde restante: ${current}.`,
      {
        characterId: id,
        before: health.current,
        damage: amount,
        current,
        transported,
        lifeState: 'ALIVE',
        sourcePages: [17, 24],
      },
      [id],
    );
    return { current, transported };
  };
  let changes: Record<string, unknown> = {};
  if (input.operation === 'GLOAMHALE_ENTER') {
    if (Object.keys(state.children).length)
      throw new ConflictException('Restore adult forms before a new entry');
    if (scene?.key !== 'reborn')
      throw new ConflictException('Entry requires the Heroes Reborn scene');
    const party = await tx
      .select()
      .from(g.characters)
      .where(
        and(
          eq(g.characters.campaignId, input.campaignId),
          eq(g.characters.known, true),
          inArray(g.characters.kind, ['PROTAGONIST', 'COMPANION']),
        ),
      );
    const selection = await guidedParty(input.campaignId, tx);
    const activeParty = selection
      ? party.filter(
          (member) =>
            member.kind === 'PROTAGONIST' ||
            selection.companionIds.includes(member.id),
        )
      : party;
    const ids = input.children.map((p) => p.characterId);
    if (
      new Set(ids).size !== ids.length ||
      ids.length !== activeParty.length ||
      activeParty.some((p) => !ids.includes(p.id) || !present.includes(p.id))
    )
      throw new BadRequestException(
        'Enter with the entire present party, without duplicate or foreign characters',
      );
    for (const member of input.children) {
      const scores = await tx
        .select()
        .from(g.characterAbilities)
        .where(eq(g.characterAbilities.characterId, member.characterId));
      const [vital] = await tx
        .select()
        .from(g.characterVitals)
        .where(eq(g.characterVitals.characterId, member.characterId));
      const [health] = await tx
        .select()
        .from(g.characterResources)
        .where(
          and(
            eq(g.characterResources.characterId, member.characterId),
            eq(g.characterResources.name, 'HEALTH'),
          ),
        );
      if (
        scores.length !== abilities.length ||
        vital?.lifeState !== 'ALIVE' ||
        !health?.current
      )
        throw new ConflictException('Living complete party sheets required');
      state.children[member.characterId] = {
        original: Object.fromEntries(scores.map((s) => [s.ability, s.score])),
        age: member.age,
        fear: member.fear,
        location: 'MANOR',
      };
    }
    state.stage = 0;
    state.elapsedMinutes = 0;
    const face = dice.damageDice(1)[0]!;
    state.nextChangeAt = Math.ceil(face / 2) * 60;
    await emit('GLOAMHALE_CLOCK', input.reason, 'GM_ONLY', {
      d6: face,
      nextChangeAt: state.nextChangeAt,
      sourcePages: [15],
    });
    await announce(
      'GLOAMHALE_TRANSFORMED',
      'O grupo assumiu as idades infantis confirmadas; os atributos ainda não mudaram.',
      {
        children: input.children.map(({ characterId, age }) => ({
          characterId,
          age,
        })),
        sourcePages: [15],
      },
      ids,
    );
  } else if (input.operation === 'GLOAMHALE_TIME') {
    if (!Object.keys(state.children).length)
      throw new ConflictException('No active child transformation');
    state.elapsedMinutes += input.minutes;
    const rolls: number[] = [];
    while (
      state.nextChangeAt !== null &&
      state.elapsedMinutes >= state.nextChangeAt
    ) {
      state.stage++;
      for (const [id, member] of Object.entries(state.children))
        await writeScores(id, manorScores(member.original, state.stage));
      if (state.stage === 4) state.nextChangeAt = null;
      else {
        const face = dice.damageDice(1)[0]!;
        rolls.push(face);
        state.nextChangeAt += Math.ceil(face / 2) * 60;
      }
    }
    changes = { stage: state.stage, elapsedMinutes: state.elapsedMinutes };
    await emit('GLOAMHALE_CLOCK', input.reason, 'GM_ONLY', {
      ...changes,
      rolls,
      nextChangeAt: state.nextChangeAt,
      sourcePages: [15, 17],
    });
    await announce(
      'GLOAMHALE_ABILITIES_CHANGED',
      `Tempo narrativo confirmado: ${input.minutes} minutos. Estágio de transformação: ${state.stage} de 4.`,
      changes,
      Object.keys(state.children),
    );
  } else if (input.operation === 'GLOAMHALE_RETURN') {
    if (new Set(input.characterIds).size !== input.characterIds.length)
      throw new BadRequestException('Duplicate character');
    for (const id of input.characterIds) {
      await writeScores(id, child(id).original);
      delete state.children[id];
    }
    if (!Object.keys(state.children).length) state.nextChangeAt = null;
    await announce(
      'GLOAMHALE_ADULT_RESTORED',
      'Formas adultas e atributos anteriores à transformação restaurados por uma condição confirmada.',
      {
        cause: input.cause,
        characterIds: input.characterIds,
        sourcePages: [15, 26],
      },
      input.characterIds,
    );
  } else if (input.operation === 'GLOAMHALE_MOVE') {
    if (!present.includes(input.characterId))
      throw new ConflictException(
        'Character must be present in the prepared scene',
      );
    child(input.characterId).location = input.location;
    await announce(
      'GLOAMHALE_MOVED',
      'Deslocamento confirmado dentro dos terrenos da mansão.',
      { characterId: input.characterId, location: input.location },
      [input.characterId],
    );
  } else if (input.operation === 'GLOAMHALE_DAMAGE') {
    if (!present.includes(input.characterId))
      throw new ConflictException('Character must be present');
    changes = await damage(input.characterId, input.damage);
  } else if (input.operation === 'GLOAMHALE_RITUAL_BEGIN') {
    if (scene?.key !== 'ritual')
      throw new ConflictException('Prepare the ritual scene');
    if (state.ritual)
      throw new ConflictException('Ritual cannot be started again');
    const partyIds = Object.keys(state.children);
    if (
      partyIds.length < 4 ||
      partyIds.length > 6 ||
      partyIds.some(
        (id) => !present.includes(id) || child(id).location !== 'MANOR',
      )
    )
      throw new ConflictException(
        'Ritual requires the entire child party in the manor',
      );
    if (
      new Set(input.eggEaters).size !== input.eggEaters.length ||
      input.eggEaters.some((id) => !partyIds.includes(id))
    )
      throw new BadRequestException(
        'Egg beneficiaries must belong to the party',
      );
    state.ritual = {
      status: 'ACTIVE',
      partyIds,
      threshold: 12 + partyIds.length,
      points: 0,
      tasks: [],
      eggEaters: input.eggEaters,
      eggsUsed: [],
      dispelledHaints: input.dispelledHaints,
      haintsUsed: [],
      hazardProtection: input.hazardProtection,
      pending: null,
    };
    await announce(
      'GLOAMHALE_RITUAL_STARTED',
      `Ritual iniciado; limiar coletivo: ${state.ritual.threshold}. As três tarefas devem ser tentadas.`,
      { threshold: state.ritual.threshold, sourcePages: [24, 25] },
      partyIds,
    );
  } else {
    const ritual = state.ritual;
    if (!ritual || ritual.status !== 'ACTIVE')
      throw new ConflictException('No active ritual');
    if (input.operation !== 'GLOAMHALE_RITUAL_STOP' && scene?.key !== 'ritual')
      throw new ConflictException('Return to the ritual scene');
    if (input.operation === 'GLOAMHALE_RITUAL_STOP') {
      if (ritual.pending)
        throw new ConflictException(
          'Resolve the already rolled ritual hazard before stopping',
        );
      ritual.status = 'STOPPED';
      ritual.pending = null;
      await tx
        .update(a.adventureCast)
        .set({
          currentState:
            'Enfraquecido pelo ritual interrompido; pode recuperar forças em meses ou anos (SoS p.26).',
        })
        .where(
          and(
            eq(a.adventureCast.campaignId, input.campaignId),
            eq(a.adventureCast.key, 'jaymes'),
          ),
        );
      await announce(
        'GLOAMHALE_RITUAL_STOPPED',
        'Ritual interrompido voluntariamente. Cessa o dano do ritual e ele não pode ser tentado novamente; Jaymes foi enfraquecido temporariamente.',
        { sourcePages: [26] },
        ritual.partyIds,
      );
    } else if (input.operation === 'GLOAMHALE_RITUAL_ROLL') {
      if (
        !ritual.partyIds.includes(input.characterId) ||
        !present.includes(input.characterId) ||
        child(input.characterId).location !== 'MANOR'
      )
        throw new ConflictException(
          'Ritual participant must be inside the manor and present',
        );
      const [vital] = await tx
        .select()
        .from(g.characterVitals)
        .where(eq(g.characterVitals.characterId, input.characterId));
      const [health] = await tx
        .select()
        .from(g.characterResources)
        .where(
          and(
            eq(g.characterResources.characterId, input.characterId),
            eq(g.characterResources.name, 'HEALTH'),
          ),
        );
      if (vital?.lifeState !== 'ALIVE' || !health?.current)
        throw new ConflictException('Character cannot act');
      if (input.benefit === 'EGG') {
        if (
          !ritual.eggEaters.includes(input.characterId) ||
          ritual.eggsUsed.includes(input.characterId)
        )
          throw new ConflictException('Egg benefit unavailable');
        ritual.eggsUsed.push(input.characterId);
      } else if (input.benefit !== 'NONE') {
        if (
          !ritual.dispelledHaints ||
          ritual.haintsUsed.includes(input.characterId)
        )
          throw new ConflictException('Haint benefit unavailable');
        ritual.haintsUsed.push(input.characterId);
      }
      const [ability, focus] =
        input.task === 'CANDLES'
          ? (['CONSTITUTION', 'constitution-stamina'] as const)
          : input.task === 'POEM'
            ? (['WILLPOWER', 'willpower-self-discipline'] as const)
            : (['INTELLIGENCE', 'intelligence-shaping'] as const);
      const [score] = await tx
        .select()
        .from(g.characterAbilities)
        .where(
          and(
            eq(g.characterAbilities.characterId, input.characterId),
            eq(g.characterAbilities.ability, ability),
          ),
        );
      const [feature] = await tx
        .select()
        .from(g.characterFeatures)
        .where(
          and(
            eq(g.characterFeatures.characterId, input.characterId),
            eq(g.characterFeatures.ruleId, focus),
          ),
        );
      if (!score) throw new ConflictException('Ability missing');
      const roll = dice.roll(
        score.score +
          (feature ? (feature.improved ? 3 : 2) : 0) -
          vital.fatigueLevel +
          input.modifier,
      );
      const target = ['EGG', 'HAINT_TARGET'].includes(input.benefit) ? 10 : 11;
      const check = resolveBasicCheck(roll, target, true);
      const [last] = await tx
        .select({ sequence: max(g.diceRolls.publicSequence) })
        .from(g.diceRolls)
        .where(eq(g.diceRolls.campaignId, input.campaignId));
      const [record] = await tx
        .insert(g.diceRolls)
        .values({
          campaignId: input.campaignId,
          sessionId: input.sessionId,
          characterId: input.characterId,
          die1: roll.dice[0],
          die2: roll.dice[1],
          dramaDie: roll.dramaDie,
          modifier: roll.modifier,
          total: roll.total,
          success: check.success,
          stuntPoints: check.stuntPoints,
          visibility: 'PUBLIC',
          publicSequence: (last?.sequence ?? 0) + 1,
          reason: 'Ritual de Gloamhale',
        })
        .returning();
      ritual.pending = {
        characterId: input.characterId,
        task: input.task,
        benefit: input.benefit,
        roll,
        ...check,
        rollId: record!.id,
      };
      changes = { rollId: record!.id, ...roll, ...check, targetNumber: target };
      await announce(
        'ABILITY_CHECK',
        `Ritual: [${roll.dice.join(', ')}], modificador ${roll.modifier}, total ${roll.total}, NA ${target}: ${check.success ? 'sucesso' : 'falha'}; ${check.stuntPoints} PF. Aguardando decisão explícita de dispensar façanhas para aplicar os efeitos básicos.`,
        changes,
        [input.characterId],
      );
    } else if (input.operation === 'GLOAMHALE_RITUAL_RESOLVE') {
      const pending = ritual.pending;
      if (!pending) throw new ConflictException('No pending ritual test');
      const faces = dice.damageDice(2),
        rawDamage = faces.reduce((a, b) => a + b, 0);
      let armor = 0;
      if (ritual.hazardProtection === 'ARMOR') {
        const [profile] = await tx
          .select()
          .from(g.combatProfiles)
          .where(eq(g.combatProfiles.characterId, pending.characterId));
        if (!profile) throw new ConflictException('Armor profile required');
        armor = armorRules[profile.armorType].rating;
      }
      const outcome = ritualOutcome(
        ritual.points,
        ritual.tasks,
        pending.task,
        pending.success,
        pending.roll.dramaDie,
        ritual.threshold,
        rawDamage,
        pending.benefit === 'HAINT_DAMAGE',
        armor,
      );
      await damage(pending.characterId, outcome.damage);
      ritual.points = outcome.points;
      ritual.tasks = outcome.tasks;
      ritual.pending = null;
      if (outcome.completed) {
        if (hasNarrativeIntegrity(definition))
          await emit(
            integrityEventType,
            'Banimento definitivo confirmado pelo ritual.',
            'GM_ONLY',
            { jaymesBanished: true },
          );

        ritual.status = 'COMPLETED';
        await tx
          .update(a.adventureCast)
          .set({
            currentState:
              'Banido definitivamente pelo ritual; não pode retornar a este reino (SoS pp.24–26).',
          })
          .where(
            and(
              eq(a.adventureCast.campaignId, input.campaignId),
              eq(a.adventureCast.key, 'jaymes'),
            ),
          );
        // A source-wide consequence, not shared personal memory for these archetypes.
        await tx
          .update(a.adventureCast)
          .set({
            currentState:
              'Remanescentes desaparecem ao concluir o ritual; não há indivíduos deste arquétipo ativos na mansão (SoS pp.25–26).',
          })
          .where(
            and(
              eq(a.adventureCast.campaignId, input.campaignId),
              inArray(a.adventureCast.key, [
                'specter',
                'poltergeist',
                'rat-swarm',
              ]),
            ),
          );
      }
      changes = {
        ...outcome,
        damageDice: faces,
        rawDamage,
        armor,
        rollId: pending.rollId,
        sourcePages: [24, 25, 26],
      };
      await announce(
        'GLOAMHALE_RITUAL_PROGRESS',
        outcome.completed
          ? 'Ritual concluído: Jaymes foi banido definitivamente. Orbes são opcionais; o destino de Erila e dos haints ainda depende das outras condições.'
          : `Progresso do ritual: ${ritual.points}/${ritual.threshold}; tarefas tentadas: ${ritual.tasks.join(', ')}.`,
        changes,
        ritual.partyIds.filter(
          (id) =>
            state.children[id]?.location === 'MANOR' && present.includes(id),
        ),
      );
    }
  }
  await emit('GLOAMHALE_LOCAL_RULING', input.reason, 'GM_ONLY', {
    operation: input.operation,
  });
  await tx
    .update(a.adventureInstances)
    .set({ mechanics: { ...state } })
    .where(eq(a.adventureInstances.campaignId, input.campaignId));
  if (definition.spatial) {
    const loaded = await loadAdventure(input.campaignId, tx);
    const pc = loaded?.instance.protagonistId;
    const before = pc ? stored?.children[pc]?.location : undefined;
    const after = pc ? state.children[pc]?.location : undefined;
    if (loaded && before && after && before !== after) {
      const place = { MANOR: 'manor', GROUNDS: 'grounds', GROTTO: 'grotto' }[
        after
      ];
      await spatialArrival(loaded, input.sessionId, place, tx, input.commandId);
      if (state.ritual?.status !== 'ACTIVE')
        await detachSpatialEncounter(
          loaded,
          input.sessionId,
          definition.locations.find((l) => l.key === place)!.description,
          tx,
        );
    }
  }
  return {
    id: input.campaignId,
    eventIds,
    ...changes,
    stage: state.stage,
    ritualStatus: state.ritual?.status ?? null,
  };
}
