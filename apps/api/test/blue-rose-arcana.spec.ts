import {
  bodyControlDifficulty,
  moveObjectRule,
  sightInformation,
  windChange,
} from '../src/blue-rose/arcana/arcana.rules';

describe('Arcanos AGE — BR brasileiro pp.100–113 e errata', () => {
  it('uses the published mass steps and optional tenfold fatigued capacity', () => {
    expect(moveObjectRule(1, false)).toEqual({
      targetNumber: 9,
      fatigue: false,
    });
    expect(moveObjectRule(2.5, false).targetNumber).toBe(11);
    expect(moveObjectRule(100, false).targetNumber).toBe(21);
    expect(moveObjectRule(1000, true)).toEqual({
      targetNumber: 21,
      fatigue: true,
    });
    expect(() => moveObjectRule(101, false)).toThrow();
    expect(() => moveObjectRule(0, false)).toThrow();
  });
  it('changes wind by one category plus one per two points of success', () => {
    expect(windChange(8, 1, 3)).toBe(1);
    expect(windChange(9, 1, 3)).toBe(2);
    expect(windChange(13, 1, 3)).toBe(3);
    expect(windChange(11, 4, 0)).toBe(2);
    expect(windChange(30, 0, 6)).toBe(6);
  });
  it('requires the corrected Body Control difficulties', () => {
    expect(bodyControlDifficulty('SLEEP')).toBe(7);
    expect(bodyControlDifficulty('DIFFICULT_SLEEP')).toBe(9);
    expect(bodyControlDifficulty('IGNORE_PAIN')).toBe(11);
    expect(bodyControlDifficulty('FEIGN_DEATH')).toBe(13);
  });
  it('does not disclose a caster identity merely because a secret sense roll succeeds', () => {
    expect(sightInformation(10, 11, true)).toBe('NONE');
    expect(sightInformation(11, 11, true)).toBe('DISCIPLINE');
    expect(sightInformation(13, 11, false)).toBe('ARCANUM');
    expect(sightInformation(15, 11, false)).toBe('ARCANUM');
    expect(sightInformation(15, 11, true)).toBe('KNOWN_CASTER');
  });
});
