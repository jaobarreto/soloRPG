const { test } = require('node:test');
const assert = require('node:assert/strict');
const { z } = require('zod');
const { freeActionSchema } = require('../dist');
const fixtures = require('../fixtures/phase5611-semantics.json');
const plan = require('../../../docs/ai/phase-5.6.1-plan.json');

test('TEST-SEM5611 expression and arcana applicability are documented on the wire', () => {
  const schema = z.toJSONSchema(freeActionSchema, { io: 'input' });
  const expression = schema.properties.expression.description || '';
  assert.ok(
    expression.includes('interactionMode') &&
      expression.includes('QUESTION') &&
      expression.includes('DIRECT'),
  );
  const arcana = schema.properties.tool.oneOf.find(
    (s) => s.properties.type.const === 'ARCANA',
  );
  for (const [field, arcanum] of [
    ['raised', 'psychic-shield'],
    ['tradition', 'psychic-contact'],
    ['use', 'body-control'],
    ['fatigue', 'move-object'],
    ['category', 'wind-shaping'],
  ])
    assert.ok(arcana.properties[field].description.includes(arcanum));
});

test('TEST-SEM5611 structural compatibility preserves relevant choices and does not silently discard a forbidden value', () => {
  for (const tool of fixtures.validTools)
    assert.ok(
      freeActionSchema.safeParse({ ...plan.cases[5].offlineProposal, tool })
        .success,
    );
  const tool = {
    type: 'ARCANA',
    arcanum: 'psychic-shield',
    raised: true,
    tradition: 'PSYCHIC',
  };
  assert.equal(
    freeActionSchema.parse({ ...plan.cases[5].offlineProposal, tool }).tool
      .tradition,
    'PSYCHIC',
  );
  assert.equal(
    freeActionSchema.parse(plan.cases[0].offlineProposal).expression,
    'QUESTION',
  );
  assert.equal(
    freeActionSchema.parse({
      ...plan.cases[0].offlineProposal,
      expression: 'DIRECT',
    }).expression,
    'DIRECT',
  );
});
