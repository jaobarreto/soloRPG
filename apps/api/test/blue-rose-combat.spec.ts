import {
  resolveOpposedCheck,
  damageAfterArmor,
  validateCombatStunts,
  weaponRules,
  combatStunts,
} from '../src/blue-rose/combat.rules';
const roll = (total: number, dramaDie: number) => ({
  dice: [1, 1, dramaDie] as [number, number, number],
  modifier: total - 2 - dramaDie,
  total,
  dramaDie,
});
describe('Blue Rose AGE core combat and opposed checks (BR pp.16,22-24,54-57)', () => {
  it('breaks opposed ties by Drama Die then raw ability and preserves a complete tie', () => {
    expect(resolveOpposedCheck(roll(12, 2), 1, roll(11, 6), 4)).toBe('LEFT');
    expect(resolveOpposedCheck(roll(12, 2), 4, roll(12, 3), 1)).toBe('RIGHT');
    expect(resolveOpposedCheck(roll(12, 3), 4, roll(12, 3), 1)).toBe('LEFT');
    expect(resolveOpposedCheck(roll(12, 3), 1, roll(12, 3), 1)).toBe('TIE');
  });
  it('applies armor, armor piercing and floors damage at zero', () => {
    expect(damageAfterArmor(9, 5, false)).toBe(4);
    expect(damageAfterArmor(9, 5, true)).toBe(7);
    expect(damageAfterArmor(2, 8, false)).toBe(0);
  });
  it('validates stunt costs and one use per round', () => {
    expect(validateCombatStunts(['MIGHTY_BLOW', 'PIERCE_ARMOR'], 4, [])).toBe(
      4,
    );
    expect(() => validateCombatStunts(['LETHAL_BLOW'], 4, [])).toThrow();
    expect(() =>
      validateCombatStunts(['MIGHTY_BLOW', 'MIGHTY_BLOW'], 6, []),
    ).toThrow();
    expect(() =>
      validateCombatStunts(['KNOCK_PRONE'], 6, ['KNOCK_PRONE']),
    ).toThrow();
    expect(combatStunts.DEFENSIVE_STANCE.cost).toBe(2);
    expect(weaponRules['heavy-blade'].dice).toBe(2);
  });
});
