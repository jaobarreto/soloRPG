import {
  evaluateCondition,
  evaluateUnit,
} from '../src/adventures/core/director/progression';

const fact = (reference: string) => ({ type: 'FACT' as const, reference });
const evidence = [
  { id: 'a', sequence: 1, fact: 'clue' },
  { id: 'b', sequence: 2, fact: 'route' },
];
const unit = {
  key: 'investigation',
  weight: 1,
  objectives: [
    {
      key: 'route',
      type: 'MAIN' as const,
      description: 'Interno',
      publicDescription: 'Encontrar um caminho',
      completion: fact('route'),
      weight: 1,
    },
    {
      key: 'extra',
      type: 'OPTIONAL' as const,
      description: 'Segredo',
      completion: fact('extra'),
      weight: 1,
    },
  ],
  completion: {
    operator: 'ALL' as const,
    conditions: [
      fact('clue'),
      {
        operator: 'ANY' as const,
        conditions: [fact('route'), fact('failure-route')],
      },
    ],
  },
  terminal: fact('withdrawal'),
};
describe('Director objective conditions', () => {
  it('TEST-55-001/003 ignores time and requires all confirmed prerequisites', () => {
    expect(evaluateUnit(unit, evidence.slice(0, 1), false).eligible).toBe(
      false,
    );
    expect(evaluateUnit(unit, [], false).progress).toBe(0);
  });
  it('TEST-55-002/005/012 caps progress until persisted closure, excludes optional objectives', () => {
    expect(evaluateUnit(unit, evidence, false)).toMatchObject({
      eligible: true,
      progress: 99,
    });
    expect(evaluateUnit(unit, evidence, true).progress).toBe(100);
  });
  it('TEST-55-004 supports alternative and officially failed routes', () => {
    expect(
      evaluateUnit(
        unit,
        [evidence[0]!, { id: 'c', sequence: 2, fact: 'failure-route' }],
        false,
      ).eligible,
    ).toBe(true);
  });
  it('supports deterministic sequence, dependencies and unavailable paths', () => {
    const sequence = {
      operator: 'SEQUENCE' as const,
      conditions: [fact('clue'), fact('route')],
    };
    expect(evaluateCondition(sequence, evidence).satisfied).toBe(true);
    expect(
      evaluateCondition(sequence, [
        { ...evidence[0]!, sequence: 3 },
        evidence[1]!,
      ]).satisfied,
    ).toBe(false);
    const conditional = {
      ...unit,
      objectives: [
        {
          ...unit.objectives[0]!,
          availableWhen: fact('clue'),
          unavailableWhen: fact('route'),
        },
      ],
    };
    expect(
      evaluateUnit(conditional, evidence, false).objectives[0]!.status,
    ).toBe('UNAVAILABLE');
  });
  it('TEST-55-010 repeats cannot duplicate progress or evidence', () => {
    expect(evaluateUnit(unit, [...evidence, ...evidence], false)).toEqual(
      evaluateUnit(unit, evidence, false),
    );
  });
  it('a single event cannot satisfy two sequential steps', () => {
    expect(
      evaluateCondition(
        { operator: 'SEQUENCE', conditions: [fact('clue'), fact('clue')] },
        evidence,
      ).satisfied,
    ).toBe(false);
  });
});

test('nested alternatives choose the earliest valid proof for a following sequence', () => {
  const condition = {
    operator: 'SEQUENCE' as const,
    conditions: [
      { operator: 'ANY' as const, conditions: [fact('late'), fact('early')] },
      fact('middle'),
    ],
  };
  expect(
    evaluateCondition(condition, [
      { id: 'l', sequence: 3, fact: 'late' },
      { id: 'e', sequence: 1, fact: 'early' },
      { id: 'm', sequence: 2, fact: 'middle' },
    ]).satisfied,
  ).toBe(true);
});
