import { BadRequestException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DatabaseTransaction } from '../../database/database.service';
import { abilities, type CreateCharacter } from '@solo-rpg/shared-contracts';
import * as g from '../../database/game-schema';

// Official validation needs only mechanical sheet data, never adventure content.
export interface BlueRoseSheetSnapshot {
  cast: (typeof g.characters.$inferSelect)[];
  abilities: (typeof g.characterAbilities.$inferSelect)[];
  features: (typeof g.characterFeatures.$inferSelect)[];
  resources: (typeof g.characterResources.$inferSelect)[];
  vitals: (typeof g.characterVitals.$inferSelect)[];
  profiles: (typeof g.combatProfiles.$inferSelect)[];
  training: (typeof g.weaponTraining.$inferSelect)[];
  conditions: (typeof g.characterConditions.$inferSelect)[];
}
export function validateBlueRoseSheets(snapshot: BlueRoseSheetSnapshot) {
  const errors: string[] = [];
  for (const c of snapshot.cast) {
    if (!c.characterClass) errors.push(`${c.name}: classe ausente.`);
    const scores = snapshot.abilities.filter((r) => r.characterId === c.id);
    const features = snapshot.features.filter((r) => r.characterId === c.id);
    const has = (id: string) => features.some((f) => f.ruleId === id);
    const score = (ability: string) =>
      scores.find((r) => r.ability === ability)?.score ?? -10;
    for (const [talent, ability, minimum] of [
      ['quick-reflexes', 'DEXTERITY', 2],
      ['single-weapon-style', 'PERCEPTION', 2],
      ['medicine', 'INTELLIGENCE', 1],
      ['scouting', 'DEXTERITY', 2],
      ['weapon-shield-style', 'STRENGTH', 2],
    ] as const)
      if (has(talent) && score(ability) < minimum)
        errors.push(
          `${c.name}: ${talent} exige ${ability} ${minimum} (BR pp.72,75,78,79).`,
        );
    if (has('oratory') && !has('communication-persuasion'))
      errors.push(`${c.name}: Oratória exige foco Persuasão (BR p.78).`);
    if (
      ['animism-talent', 'shaping-talent', 'healing-talent'].some(has) &&
      c.characterClass !== 'ADEPT' &&
      !c.people.toLowerCase().startsWith('vata')
    )
      errors.push(
        `${c.name}: talento arcano exige Adepto neste recorte (BR pp.72–78).`,
      );
    if (
      scores.length !== 9 ||
      abilities.some((a) => !scores.some((r) => r.ability === a))
    )
      errors.push(`${c.name}: nove habilidades obrigatórias.`);
    const health = snapshot.resources.find(
      (r) => r.characterId === c.id && r.name === 'HEALTH',
    );
    const vitals = snapshot.vitals.find((r) => r.characterId === c.id);
    if (
      !health ||
      health.current < 1 ||
      health.current > health.maximum ||
      vitals?.lifeState !== 'ALIVE' ||
      vitals.fatigueLevel > 0
    )
      errors.push(
        `${c.name}: recursos/condições iniciais incompatíveis; não corrigidos automaticamente.`,
      );
    if (c.level === 1 && health && c.characterClass) {
      const con = scores.find((r) => r.ability === 'CONSTITUTION')?.score;
      const base = { ADEPT: 20, EXPERT: 25, WARRIOR: 30 }[c.characterClass];
      if (
        con !== undefined &&
        (health.maximum < base + con + 1 || health.maximum > base + con + 6)
      )
        errors.push(
          `${c.name}: Saúde inicial fora de base + Constituição + 1d6 (BR pp.46,48,51).`,
        );
    }
    if (!snapshot.profiles.some((r) => r.characterId === c.id))
      errors.push(`${c.name}: falta perfil de equipamento aprovado.`);
    if (!snapshot.training.some((r) => r.characterId === c.id))
      errors.push(`${c.name}: treinamento de armas ausente.`);
    if (snapshot.conditions.some((r) => r.characterId === c.id))
      errors.push(
        `${c.name}: condições iniciais precisam ser resolvidas antes da primeira sessão.`,
      );
    if (
      snapshot.features.some(
        (r) => r.characterId === c.id && r.improved && c.level < 11,
      )
    )
      errors.push(`${c.name}: foco melhorado antes do nível 11.`);
  }
  return errors;
}

export async function validateSheetFeatures(
  sheet: CreateCharacter,
  tx: DatabaseTransaction,
) {
  if (
    new Set(sheet.features.map((f) => f.ruleId)).size !== sheet.features.length
  )
    throw new BadRequestException('Duplicate features');
  for (const feature of sheet.features) {
    const [rule] = await tx
      .select()
      .from(g.ruleReferences)
      .where(eq(g.ruleReferences.id, feature.ruleId));
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
