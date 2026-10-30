const { test } = require('node:test');
const assert = require('node:assert/strict');
const { narrativeProposalSchema, narrationSchema } = require('../dist');
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
test('the post-commit narrator has no command channel', () => {
  assert.equal(
    narrationSchema.safeParse({ narrative: 'Cena', eventIds: [], proposal: {} })
      .success,
    false,
  );
});
