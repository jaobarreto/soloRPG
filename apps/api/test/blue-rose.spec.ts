import { BlueRoseDice } from '../src/blue-rose/mechanics/dice/blue-rose-dice';
import { resolveBasicCheck } from '../src/blue-rose/mechanics/tests/basic-check.rules';

describe('Blue Rose AGE deterministic checks', () => {
  const dice = (...values: number[]) =>
    new BlueRoseDice({ d6: () => values.shift()! });
  it('preserves three faces and identifies the third as Drama Die', () => {
    expect(dice(2, 5, 3).roll(-2)).toEqual({
      dice: [2, 5, 3],
      dramaDie: 3,
      modifier: -2,
      total: 8,
    });
  });
  it('meets TN and generates Drama Die SP only for eligible successful doubles', () => {
    const roll = dice(4, 4, 2).roll(3);
    expect(resolveBasicCheck(roll, 13, true)).toEqual({
      success: true,
      stuntPoints: 2,
    });
    expect(resolveBasicCheck(roll, 14, true)).toEqual({
      success: false,
      stuntPoints: 0,
    });
    expect(resolveBasicCheck(roll, 13, false).stuntPoints).toBe(0);
  });
  it('detects every pair and triples without multiplying points', () => {
    for (const faces of [
      [2, 2, 5],
      [2, 5, 2],
      [5, 2, 2],
      [2, 2, 2],
    ]) {
      const roll = dice(...faces).roll();
      expect(resolveBasicCheck(roll, 1, true).stuntPoints).toBe(faces[2]);
    }
    expect(resolveBasicCheck(dice(1, 2, 3).roll(), 1, true).stuntPoints).toBe(
      0,
    );
  });
  it('rejects broken random sources and invalid mechanical values', () => {
    for (const face of [0, 7, 1.5, NaN])
      expect(() => dice(face, 1, 1).roll()).toThrow();
    expect(() => dice(1, 1, 1).roll(NaN)).toThrow();
    expect(() => resolveBasicCheck(dice(1, 1, 1).roll(), 0, true)).toThrow();
  });
  it('rolls individual damage dice and rejects invalid counts/sources', () => {
    expect(dice(2, 5).damageDice(2)).toEqual([2, 5]);
    for (const count of [0, 11, 1.5])
      expect(() => dice(1).damageDice(count)).toThrow();
    expect(() => dice(7).damageDice(1)).toThrow();
  });
  it('uses a production cryptographic d6 source', () => {
    const engine = new BlueRoseDice();
    for (let n = 0; n < 50; n++)
      for (const face of engine.roll().dice) {
        expect(face).toBeGreaterThanOrEqual(1);
        expect(face).toBeLessThanOrEqual(6);
      }
  });
});
