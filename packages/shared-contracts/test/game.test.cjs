const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const {
  abilities,
  createCharacterSchema,
  checkInputSchema,
  rollInputSchema,
  publicRollSchema,
  publicCharacterSchema,
} = require('../dist');
test('public mechanical requests reject client-authored dice, difficulty and admin fields', () => {
  const roll = { commandId: randomUUID(), sessionId: randomUUID() };
  assert.equal(rollInputSchema.safeParse(roll).success, true);
  for (const extra of [
    { dice: [6, 6, 6] },
    { modifier: 20 },
    { visibility: 'GM_ONLY' },
    { command: { type: 'RESOURCE_SET' } },
  ])
    assert.equal(
      rollInputSchema.safeParse({ ...roll, ...extra }).success,
      false,
    );
  assert.equal(
    checkInputSchema.safeParse({
      commandId: randomUUID(),
      requestId: randomUUID(),
      targetNumber: 1,
    }).success,
    false,
  );
});
test('manual transcription requires all nine abilities and public output forbids private fields', () => {
  const input = {
    commandId: randomUUID(),
    name: 'Lia',
    people: 'Human',
    characterClass: 'EXPERT',
    background: 'Aldis',
    level: 1,
    maxHealth: 30,
    abilities: Object.fromEntries(abilities.map((a) => [a, 1])),
  };
  const sheet = createCharacterSchema.parse(input);
  assert.deepEqual(sheet.features, []);
  assert.equal(
    createCharacterSchema.safeParse({ ...input, abilities: { DEXTERITY: 1 } })
      .success,
    false,
  );
  assert.equal(
    createCharacterSchema.safeParse({ ...input, privateNotes: 'secret' })
      .success,
    false,
  );
  assert.equal('privateNotes' in publicCharacterSchema.shape, false);
  assert.equal('privateObjectives' in publicCharacterSchema.shape, false);
});
test('the public roll contract cannot represent GM-only results or fields outside the validated SP range', () => {
  const roll = {
    id: randomUUID(),
    sessionId: randomUUID(),
    characterId: null,
    dice: [2, 2, 4],
    dramaDie: 4,
    modifier: 0,
    total: 8,
    success: true,
    stuntPoints: 4,
    availableStuntPoints: 0,
    reason: 'Teste',
    visibility: 'PUBLIC',
    createdAt: new Date().toISOString(),
  };
  assert.equal(publicRollSchema.safeParse(roll).success, true);
  assert.equal(
    publicRollSchema.safeParse({ ...roll, visibility: 'GM_ONLY' }).success,
    false,
  );
  assert.equal(
    publicRollSchema.safeParse({ ...roll, targetNumber: 1 }).success,
    false,
  );
  assert.equal(
    publicRollSchema.safeParse({ ...roll, availableStuntPoints: 7 }).success,
    false,
  );
});
