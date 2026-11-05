import {
  recoverFatigue,
  recoveryConstitution,
} from '../src/blue-rose/mechanics/recovery/recovery.rules';

describe('Blue Rose brasileiro p.30: recuperação de fadiga', () => {
  it('clears only the fatigue covered by the attested rest', () => {
    expect(recoverFatigue(1, 'BREATHER')).toBe(0);
    expect(recoverFatigue(2, 'BREATHER')).toBe(2);
    expect(recoverFatigue(2, 'LIGHT_REST')).toBe(0);
    expect(recoverFatigue(3, 'LIGHT_REST')).toBe(3);
    expect(recoverFatigue(3, 'SLEEP')).toBe(0);
  });
  it('does not cure dying fatigue by sleeping or accept invalid levels', () => {
    expect(() => recoverFatigue(4, 'SLEEP')).toThrow();
    expect(() => recoverFatigue(-1, 'BREATHER')).toThrow();
  });
  it('applies the vata +2 only to recovery formulas, not to the stored ability', () => {
    expect(recoveryConstitution("Vata'an", 1)).toBe(3);
    expect(recoveryConstitution('Vata’sha', 2)).toBe(4);
    expect(recoveryConstitution('Humano', 1)).toBe(1);
  });
});
