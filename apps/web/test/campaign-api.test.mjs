import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiRequest,
  formatDuration,
  mergeMessages,
} from '../src/lib/campaign-api.ts';
test('API request uses same-origin JSON, exposes validation errors and handles unavailable service', async () => {
  let options;
  const fetcher = async (url, init) => {
    options = init;
    assert.equal(url, '/api/v1/campaigns');
    return new Response('{"id":"campaign"}');
  };
  assert.deepEqual(
    await apiRequest(
      '/campaigns',
      { method: 'POST', body: JSON.stringify({ title: 'Title' }) },
      fetcher,
    ),
    { id: 'campaign' },
  );
  assert.equal(options.headers['Content-Type'], 'application/json');
  await assert.rejects(
    () =>
      apiRequest(
        '/campaigns',
        {},
        async () =>
          new Response(JSON.stringify({ message: ['title is required'] }), {
            status: 400,
          }),
      ),
    /title is required/,
  );
  await assert.rejects(
    () =>
      apiRequest(
        '/campaigns',
        {},
        async () => new Response('<html>offline</html>', { status: 502 }),
      ),
    /502/,
  );
});
test('merges paginated and sent messages in sequence order without duplicate IDs', () => {
  assert.deepEqual(
    mergeMessages(
      [{ id: 'b', sequenceNumber: 2 }],
      [
        { id: 'a', sequenceNumber: 1 },
        { id: 'b', sequenceNumber: 2 },
      ],
    ).map((m) => m.id),
    ['a', 'b'],
  );
});
test('formats actual seconds without inventing progress', () => {
  assert.equal(formatDuration(6720), '1h 52min 00s');
  assert.equal(formatDuration(0), '0min 00s');
});
