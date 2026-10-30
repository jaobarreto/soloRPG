import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkHealth } from '../src/lib/health.ts';
test('reports an actual healthy response', async () => {
  const fetcher = async () =>
    new Response(JSON.stringify({ status: 'ok', service: 'solo-rpg-api' }));
  assert.equal(await checkHealth('/health', 'solo-rpg-api', fetcher), 'online');
});
test('reports HTTP failure, malformed JSON, wrong service and network failures', async () => {
  for (const fetcher of [
    async () => new Response('{}', { status: 503 }),
    async () => new Response('bad'),
    async () => new Response('{"status":"ok","service":"solo-rpg-ai"}'),
    async () => {
      throw new Error('offline');
    },
  ]) {
    assert.equal(
      await checkHealth('/health', 'solo-rpg-api', fetcher),
      'offline',
    );
  }
});
