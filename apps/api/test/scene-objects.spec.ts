import {
  matchSceneObject,
  objectIntent,
} from '../src/adventures/core/objects/scene-objects';

describe('scene object references', () => {
  const first = { aliases: ['caixa', 'caixa de madeira'] };
  const second = { aliases: ['caixa', 'caixa de ferro'] };

  it('matches an explicit name, asks when two candidates match, and rejects absent targets', () => {
    expect(matchSceneObject([first, second], 'essa caixa de ferro')).toEqual({
      kind: 'MATCH',
      object: second,
    });
    expect(matchSceneObject([first, second], 'essa caixa')).toEqual({
      kind: 'AMBIGUOUS',
    });
    expect(matchSceneObject([first, second], 'isso')).toEqual({
      kind: 'AMBIGUOUS',
    });
    expect(matchSceneObject([second], 'caixa de madeira')).toEqual({
      kind: 'UNAVAILABLE',
    });
    expect(matchSceneObject([first], 'caixa e abro a porta')).toEqual({
      kind: 'UNAVAILABLE',
    });
  });

  it('distinguishes examination, observation, query and a request for a test', () => {
    expect(objectIntent('ACT', 'Quero examinar essa caixa.')).toMatchObject({
      kind: 'EXAMINE',
    });
    expect(objectIntent('ACT', 'Dou uma olhada na caixa.')).toMatchObject({
      kind: 'OBSERVE',
    });
    expect(objectIntent('ACT', 'Posso examinar essa caixa?')).toMatchObject({
      kind: 'QUESTION',
    });
    expect(
      objectIntent(
        'OUT_OF_CHARACTER',
        'Una, o que Naelis consegue observar daqui?',
      ),
    ).toMatchObject({ kind: 'QUESTION' });
    expect(
      objectIntent(
        'REQUEST_CHECK',
        'Quero fazer um teste para examinar essa caixa.',
      ),
    ).toMatchObject({ kind: 'CHECK' });
    for (const mode of ['THINK', 'SPEAK', 'ROLL_RESULT'])
      expect(objectIntent(mode, 'Examino a caixa.')).toBeNull();
    expect(objectIntent('ACT', 'Não examino a caixa.')).toBeNull();
  });
});
