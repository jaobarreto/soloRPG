const { test } = require('node:test');
const assert = require('node:assert/strict');
const { healthSchema } = require('../dist');
test('accepts health and rejects false positives', () => {
  assert.equal(
    healthSchema.safeParse({ status: 'ok', service: 'solo-rpg-ai' }).success,
    true,
  );
  assert.equal(
    healthSchema.safeParse({ status: 'error', service: 'solo-rpg-ai' }).success,
    false,
  );
});
