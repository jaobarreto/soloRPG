const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  narrativeProposalSchema,
  narrationSchema,
  turnResponseSchema,
} = require('../dist');
const wire = require('../fixtures/ai-turn-response.json');
const freeWire = require('../fixtures/ai-free-turn-response.json');

test('FastAPI free intentions have named selectors and no administrative channel', () => {
  assert.deepEqual(turnResponseSchema.parse(freeWire), freeWire);
  for (const tool of [
    { type: 'RESOURCE_SET', value: 99 },
    {
      type: 'ARCANA',
      arcanum: 'psychic-shield',
      raised: true,
      characterId: randomUUID(),
    },
    { type: 'PREPARED_CHECK', capability: 'Investigar', targetNumber: 1 },
  ])
    assert.equal(
      narrativeProposalSchema.safeParse({ ...freeWire.proposal, tool }).success,
      false,
    );
  assert.equal(
    narrativeProposalSchema.safeParse({
      ...freeWire.proposal,
      tool: {
        type: 'ARCANA',
        arcanum: 'second-sight',
        raised: null,
        tradition: null,
        use: null,
        fatigue: null,
        category: null,
      },
    }).success,
    true,
  );
});

test('NestJS consumes the serialized FastAPI usage contract including unknown counts', () => {
  assert.deepEqual(turnResponseSchema.parse(wire), wire);
  const unknown = structuredClone(wire);
  unknown.usage[0].totalTokens = null;
  unknown.usage[0].usageReported = false;
  assert.equal(turnResponseSchema.parse(unknown).usage[0].totalTokens, null);
  unknown.usage[0].inputTokens = -1;
  assert.equal(turnResponseSchema.safeParse(unknown).success, false);
});
test('LLM proposals reject arbitrary effects, dice and early narration', () => {
  for (const payload of [
    { kind: 'RESOURCE_SET', current: 0 },
    { kind: 'OBSERVE', damage: 20 },
    { kind: 'OBSERVE', narrative: 'Você recebe uma espada' },
    { kind: 'OBSERVE', objectiveCompleted: true },
  ])
    assert.equal(narrativeProposalSchema.safeParse(payload).success, false);
  assert.equal(
    narrativeProposalSchema.safeParse({ kind: 'OBSERVE' }).success,
    true,
  );
});
test('mechanical proposals accept choices and reject authored context and results', () => {
  const actor = randomUUID(),
    contextId = randomUUID();
  const input = {
    arcanum: 'wind-shaping',
    characterId: actor,
    contextId,
    category: 2,
  };
  const proposal = { kind: 'MECHANIC', command: { type: 'ARCANA_USE', input } };
  assert.equal(narrativeProposalSchema.safeParse(proposal).success, true);
  for (const field of [
    { damage: 99 },
    { modifier: 10 },
    { success: true },
    { massKg: 1 },
    { lineOfSight: true },
  ])
    assert.equal(
      narrativeProposalSchema.safeParse({
        ...proposal,
        command: { type: 'ARCANA_USE', input: { ...input, ...field } },
      }).success,
      false,
    );
  assert.equal(
    narrativeProposalSchema.safeParse({
      kind: 'MECHANIC',
      command: { type: 'ARCANA_CONTEXT_SET', characterId: actor, contextId },
    }).success,
    false,
  );
});
test('the post-commit narrator has no command channel', () => {
  assert.equal(
    narrationSchema.safeParse({ narrative: 'Cena', eventIds: [], proposal: {} })
      .success,
    false,
  );
});
