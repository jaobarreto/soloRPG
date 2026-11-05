const { test } = require('node:test');
const assert = require('node:assert/strict');
const { narrativeInputSchema } = require('../dist');
const id = '00000000-0000-4000-a000-000000000001';
const mention = {
  type: 'ITEM',
  entityId: id,
  label: 'Lampião Azul',
  start: 3,
  end: 16,
  literal: '#Lampião Azul',
};
test('TEST-55-017/022 UTF-16 spans preserve accents, spaces and emoji', () => {
  const input = {
    actionId: id,
    interactionMode: 'ACT',
    content: '🙂 #Lampião Azul',
    mentions: [{ ...mention, end: 16 - 1 }],
  };
  input.mentions[0].end = input.content.length;
  assert.equal(
    narrativeInputSchema.parse(input).mentions[0].literal,
    mention.literal,
  );
  assert.equal(
    narrativeInputSchema.safeParse({
      ...input,
      mentions: [{ ...input.mentions[0], start: 2 }],
    }).success,
    false,
  );
  assert.equal(
    narrativeInputSchema.safeParse({
      ...input,
      mentions: [input.mentions[0], input.mentions[0]],
    }).success,
    false,
  );
});
test('TEST-55-019 old clients remain accepted and whitespace offsets are stable', () => {
  assert.equal(
    narrativeInputSchema.safeParse({
      actionId: id,
      interactionMode: 'ACT',
      content: 'ação livre',
    }).success,
    true,
  );
  const content = '  #Lampião Azul  ';
  const parsed = narrativeInputSchema.parse({
    actionId: id,
    interactionMode: 'ACT',
    content,
    mentions: [{ ...mention, start: 2, end: 15 }],
  });
  assert.equal(parsed.content, content);
});
