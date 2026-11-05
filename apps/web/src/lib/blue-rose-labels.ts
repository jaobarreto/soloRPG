import type { abilities } from '@solo-rpg/shared-contracts';

export const abilityLabels: Record<(typeof abilities)[number], string> = {
  ACCURACY: 'Precisão',
  COMMUNICATION: 'Comunicação',
  CONSTITUTION: 'Constituição',
  DEXTERITY: 'Destreza',
  FIGHTING: 'Luta',
  INTELLIGENCE: 'Inteligência',
  PERCEPTION: 'Percepção',
  STRENGTH: 'Força',
  WILLPOWER: 'Vontade',
};
