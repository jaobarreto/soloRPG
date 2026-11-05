const { test } = require('node:test');
const assert = require('node:assert/strict');
const { freeActionSchema, dialogueBindingSchema } = require('../dist');

test('contextual dialogue keeps legacy transport and rejects free prose/effects', () => {
  const base = {
    kind: 'FREE',
    intent: 'TALK',
    description: 'Perguntar',
    target: { type: 'CHARACTER', name: 'Iria' },
    tool: { type: 'DIALOGUE' },
  };
  assert.deepEqual(freeActionSchema.parse(base), base);
  assert.ok(
    freeActionSchema.safeParse({
      ...base,
      tool: { type: 'DIALOGUE', topic: 'conversation', act: 'ANSWER' },
    }).success,
  );
  for (const extra of [
    { effect: 'HELP' },
    { text: 'confie em mim' },
    { sources: ['private'] },
    { libraryId: 'evil' },
  ])
    assert.equal(
      freeActionSchema.safeParse({
        ...base,
        tool: { type: 'DIALOGUE', ...extra },
      }).success,
      false,
    );
  assert.equal(
    dialogueBindingSchema.safeParse({
      libraryId: 'khaos-dialogue',
      contentVersion: 2,
    }).success,
    false,
  );
});
