import { abilities } from '@solo-rpg/shared-contracts';
import type { BlueRoseDiceResult } from '../../../../blue-rose/mechanics/dice/blue-rose-dice';

export type RitualTask = 'CANDLES' | 'POEM' | 'SHAPING';
export type RitualBenefit = 'NONE' | 'EGG' | 'HAINT_TARGET' | 'HAINT_DAMAGE';
export const gloamhalePublicEventTypes = [
  'GLOAMHALE_TRANSFORMED',
  'GLOAMHALE_ABILITIES_CHANGED',
  'GLOAMHALE_ADULT_RESTORED',
  'GLOAMHALE_MOVED',
  'GLOAMHALE_RITUAL_STARTED',
  'GLOAMHALE_RITUAL_STOPPED',
  'GLOAMHALE_RITUAL_PROGRESS',
] as const;
export interface GloamhaleMechanics {
  // Adult scores are retained separately; no changes to the source definition.
  children: Record<
    string,
    {
      original: Record<string, number>;
      age: number;
      fear: string;
      location: 'MANOR' | 'GROUNDS' | 'GROTTO';
    }
  >;
  stage: number;
  elapsedMinutes: number;
  nextChangeAt: number | null;
  ritual?: {
    status: 'ACTIVE' | 'STOPPED' | 'COMPLETED';
    partyIds: string[];
    threshold: number;
    points: number;
    tasks: RitualTask[];
    eggEaters: string[];
    eggsUsed: string[];
    dispelledHaints: boolean;
    haintsUsed: string[];
    hazardProtection: 'NONE' | 'ARMOR';
    pending: {
      characterId: string;
      task: RitualTask;
      benefit: RitualBenefit;
      roll: BlueRoseDiceResult;
      success: boolean;
      stuntPoints: number;
      rollId: string;
    } | null;
  };
}

// Six of Swords pp.15,17. Negative abilities are intentional, without a new floor.
export function manorScores(original: Record<string, number>, stage: number) {
  const changes = Math.min(4, Math.max(0, stage));
  return Object.fromEntries(
    abilities.map((ability) => [
      ability,
      original[ability]! +
        (ability === 'COMMUNICATION'
          ? Math.max(0, changes - 1)
          : ability === 'DEXTERITY'
            ? -Math.max(0, changes - 2)
            : -changes),
    ]),
  );
}

// Six of Swords pp.24–25; hazard rounding: Brazilian core pp.315–316.
// Whether physical armor protects is an explicit local ruling, never inferred by AI.
export function ritualOutcome(
  points: number,
  tasks: RitualTask[],
  task: RitualTask,
  success: boolean,
  dramaDie: number,
  threshold: number,
  rawDamage: number,
  haintDamage: boolean,
  armor: number,
) {
  const nextTasks = [...new Set([...tasks, task])];
  const nextPoints = points + (success ? dramaDie : 0);
  let damage = success ? Math.floor(rawDamage / 2) : rawDamage;
  damage = Math.max(0, damage - armor);
  if (haintDamage) damage = Math.floor(damage / 2);
  return {
    points: nextPoints,
    tasks: nextTasks,
    completed: nextPoints >= threshold && nextTasks.length === 3,
    damage,
  };
}
