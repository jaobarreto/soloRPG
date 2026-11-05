import { declaredDice } from '../src/narrative/queued-interaction';
import { BlueRoseDice } from '../src/blue-rose/mechanics/dice/blue-rose-dice';
import { resolveBasicCheck } from '../src/blue-rose/mechanics/tests/basic-check.rules';

it('validates declared faces and calculates AGE success and stunts from the actual dice', () => {
  const faces = declaredDice('Rolei 4, 4 e 2. O Dado de Drama foi 2.');
  expect(faces).toEqual([4, 4, 2]);
  expect(declaredDice('Rolei 4, 4 e 2. O Dado de Drama foi 4.')).toBeNull();
  expect(declaredDice('Rolei 7, 4 e 2.')).toBeNull();
  expect(declaredDice('Total 18')).toBeNull();
  const source = { d6: jest.fn() };
  const roll = new BlueRoseDice(source).roll(3, faces!);
  expect(source.d6).not.toHaveBeenCalled();
  expect(roll).toMatchObject({
    total: 13,
    dramaDie: 2,
    source: 'PLAYER_DECLARED',
  });
  expect(resolveBasicCheck(roll, 13, true)).toEqual({
    success: true,
    stuntPoints: 2,
  });
  expect(resolveBasicCheck(roll, 14, true)).toEqual({
    success: false,
    stuntPoints: 0,
  });
});
