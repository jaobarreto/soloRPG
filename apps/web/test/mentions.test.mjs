import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  editMentions,
  mentionQuery,
  selectMention,
} from '../src/lib/mentions.ts';

test('TEST-55-022 edits/deletions preserve UTF-16 offsets, spaces, accents and multiple references', () => {
  const candidate = { type: 'ITEM', entityId: 'item', label: 'Lampião Azul' };
  const inserted = selectMention(
    '🙂 #Lam',
    [],
    { start: 3, end: 7, symbol: '#', query: 'Lam' },
    candidate,
  );
  assert.equal(inserted.content, '🙂 #Lampião Azul ');
  assert.equal(inserted.mentions[0].start, 3);
  assert.equal(inserted.mentions[0].end, 16);
  const shifted = editMentions(
    inserted.content,
    'x' + inserted.content,
    inserted.mentions,
  );
  assert.equal(shifted[0].start, 4);
  assert.equal(
    editMentions(
      inserted.content,
      inserted.content.replace('Azul', 'verde'),
      inserted.mentions,
    ).length,
    0,
  );
  assert.equal(
    editMentions(inserted.content, '🙂 ', inserted.mentions).length,
    0,
  );
  assert.equal(mentionQuery('Quero falar com @Éi', 19)?.query, 'Éi');
  assert.equal(mentionQuery('email@nome', 10), null);
});
test('selected references do not reopen autocomplete; the next trigger does', () => {
  const first = selectMention(
    '@Ei',
    [],
    { start: 0, end: 3, symbol: '@', query: 'Ei' },
    { type: 'CHARACTER', entityId: 'npc', label: 'Eileen' },
  );
  assert.equal(
    mentionQuery(first.content, first.content.length, first.mentions),
    null,
  );
  const text = first.content + 'pegue #Lam';
  assert.equal(mentionQuery(text, text.length, first.mentions)?.symbol, '#');
});
