import { BadRequestException } from '@nestjs/common';
import type { BlueRoseDiceResult } from './blue-rose.rules';
export const combatStunts = {
  MIGHTY_BLOW: { name: 'Golpe Poderoso', cost: 2, damageDice: 1 },
  PIERCE_ARMOR: { name: 'Perfurar Armadura', cost: 2, damageDice: 0 },
  KNOCK_PRONE: { name: 'Derrubar', cost: 2, damageDice: 0 },
  DEFENSIVE_STANCE: { name: 'Postura Defensiva', cost: 2, damageDice: 0 },
  LETHAL_BLOW: { name: 'Golpe Letal', cost: 5, damageDice: 2 },
} as const;
export type CombatStunt = keyof typeof combatStunts;
export const weaponRules = {
  'heavy-blade': {
    name: 'Lâmina pesada padrão',
    ability: 'FIGHTING',
    focusId: 'fighting-heavy-blades',
    dice: 2,
    bonus: 0,
    damageAbility: 'STRENGTH',
    range: 2,
    longRange: 2,
    reload: false,
  },
  'light-blade': {
    name: 'Lâmina leve padrão',
    ability: 'ACCURACY',
    focusId: 'accuracy-light-blades',
    dice: 1,
    bonus: 1,
    damageAbility: 'STRENGTH',
    range: 2,
    longRange: 2,
    reload: false,
  },
  longbow: {
    name: 'Arco longo',
    ability: 'ACCURACY',
    focusId: 'accuracy-bows',
    dice: 1,
    bonus: 3,
    damageAbility: 'PERCEPTION',
    range: 30,
    longRange: 60,
    reload: true,
  },
} as const;
export type WeaponRuleId = keyof typeof weaponRules;
export const armorRules = {
  NONE: { rating: 0, penalty: 0 },
  LIGHT: { rating: 3, penalty: 0 },
  MEDIUM: { rating: 5, penalty: -2 },
  HEAVY: { rating: 8, penalty: -4 },
} as const;
export const shieldRules = { NONE: 0, LIGHT: 1, MEDIUM: 2, HEAVY: 3 } as const;
export function resolveOpposedCheck(
  left: BlueRoseDiceResult,
  leftAbility: number,
  right: BlueRoseDiceResult,
  rightAbility: number,
): 'LEFT' | 'RIGHT' | 'TIE' {
  for (const difference of [
    left.total - right.total,
    left.dramaDie - right.dramaDie,
    leftAbility - rightAbility,
  ])
    if (difference !== 0) return difference > 0 ? 'LEFT' : 'RIGHT';
  return 'TIE';
}
export function damageAfterArmor(raw: number, armor: number, pierce: boolean) {
  return Math.max(0, raw - (pierce ? Math.floor(armor / 2) : armor));
}
export function validateCombatStunts(
  stunts: CombatStunt[],
  points: number,
  used: CombatStunt[],
): number {
  if (
    new Set(stunts).size !== stunts.length ||
    stunts.some((s) => used.includes(s))
  )
    throw new BadRequestException('A stunt can only be used once per round');
  const cost = stunts.reduce((sum, s) => sum + combatStunts[s].cost, 0);
  if (cost > points) throw new BadRequestException('Insufficient stunt points');
  return cost;
}
