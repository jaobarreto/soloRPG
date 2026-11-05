import { abilities } from '@solo-rpg/shared-contracts';
import {
  manorScores,
  ritualOutcome,
} from '../src/adventures/gloamhale/runtime/mechanics/gloamhale-mechanics';

describe('Gloamhale source rules (Six of Swords pp.15,17,24–25)', () => {
  const original = Object.fromEntries(abilities.map((a) => [a, 2]));
  it('changes abilities cumulatively, caps at four stages and preserves the adult snapshot', () => {
    expect(manorScores(original, 0)).toEqual(original);
    expect(manorScores(original, 1)).toMatchObject({
      COMMUNICATION: 2,
      DEXTERITY: 2,
      STRENGTH: 1,
    });
    expect(manorScores(original, 2)).toMatchObject({
      COMMUNICATION: 3,
      DEXTERITY: 2,
      STRENGTH: 0,
    });
    expect(manorScores(original, 3)).toMatchObject({
      COMMUNICATION: 4,
      DEXTERITY: 1,
      STRENGTH: -1,
    });
    expect(manorScores(original, 4)).toMatchObject({
      COMMUNICATION: 5,
      DEXTERITY: 0,
      STRENGTH: -2,
    });
    expect(manorScores(original, 30)).toEqual(manorScores(original, 4));
    expect(original.STRENGTH).toBe(2);
  });
  it('counts only successful Drama Dice, requires all three tasks and halves hazard damage downward', () => {
    expect(
      ritualOutcome(
        15,
        ['CANDLES', 'POEM'],
        'SHAPING',
        false,
        6,
        16,
        9,
        false,
        0,
      ),
    ).toEqual({
      points: 15,
      tasks: ['CANDLES', 'POEM', 'SHAPING'],
      completed: false,
      damage: 9,
    });
    expect(
      ritualOutcome(15, ['CANDLES'], 'CANDLES', true, 6, 16, 9, false, 0)
        .completed,
    ).toBe(false);
    expect(
      ritualOutcome(
        15,
        ['CANDLES', 'POEM'],
        'SHAPING',
        true,
        3,
        16,
        9,
        false,
        0,
      ),
    ).toMatchObject({ points: 18, completed: true, damage: 4 });
    expect(ritualOutcome(0, [], 'POEM', true, 3, 16, 11, true, 0).damage).toBe(
      2,
    );
    expect(ritualOutcome(0, [], 'POEM', false, 3, 16, 9, false, 4).damage).toBe(
      5,
    );
  });
});
