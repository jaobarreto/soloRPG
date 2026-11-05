import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { freeActionSchema, scenePlanSchema } from '@solo-rpg/shared-contracts';
import {
  publicationChoices,
  validateRendering,
  type RenderingContext,
} from '../src/narrative/rendering';
import {
  authorizeDialogue,
  dialogueSourceHash,
  type AuthorizedReply,
  type DialogueSource,
} from '../src/narrative/dialogue-content';
import type { DialogueBinding } from '@solo-rpg/shared-contracts';

const speakerId = randomUUID();
const reply: AuthorizedReply = {
  id: 'reply-v1',
  libraryId: 'khaos-dialogue',
  contentVersion: 1,
  voiceId: 'RESERVED',
  topic: 'disagreement',
  act: 'ANSWER',
  provenance: { authorId: 'fixture', source: 'reviewed', reviewed: true },
  bindingProvenance: {
    authorId: 'fixture',
    source: 'reviewed',
    reviewed: true,
  },
  sourceReferences: [],
  beat: {
    kind: 'DIALOGUE' as const,
    speakerId,
    text: 'Iria — Não considero esse desacordo resolvido.',
    factIds: [],
  },
};
const context: RenderingContext = {
  category: 'DIALOGUE',
  speaker: { id: speakerId, name: 'Iria' },
  protagonist: null,
  scene: null,
  facts: [],
  rules: [],
  dialogue: {
    version: 1,
    selection: { topic: 'disagreement', act: 'ANSWER' },
    replies: [reply],
  },
};
const confirmed = { narrative: 'Iria ouviu sua fala.', eventIds: [] };

describe('TEST-VOICE-001/003 strict contextual dialogue extension', () => {
  it('keeps Python/Zod strict and compatible for legacy and contextual selectors', () => {
    const tools = [
      { type: 'DIALOGUE' },
      { type: 'DIALOGUE', topic: 'conversation', act: 'ANSWER' },
      { type: 'DIALOGUE', topic: null, act: null },
      { type: 'DIALOGUE', topic: 'conversation', act: 'HELP' },
      {
        type: 'DIALOGUE',
        topic: 'conversation',
        act: 'ANSWER',
        state: 'CHANGED',
      },
      { type: 'DIALOGUE', text: 'Texto inventado' },
      { type: 'DIALOGUE', sources: [randomUUID()] },
    ];
    const proposals = tools.map((tool) => ({
      kind: 'FREE',
      intent: 'TALK',
      description: 'Perguntar',
      target: { type: 'CHARACTER', name: 'Iria' },
      expression: 'QUESTION',
      evidence: [],
      tool,
    }));
    const child = spawnSync(
      resolve(__dirname, '../../ai-service/.venv/bin/python'),
      [
        '-c',
        `import json,sys
from pydantic import ValidationError
from app.narrative.schemas import SelectedFreeAction
rows=[]
for raw in json.load(sys.stdin):
 try: rows.append({'valid':True,'proposal':SelectedFreeAction.model_validate(raw).model_dump(mode='json')})
 except ValidationError: rows.append({'valid':False})
print(json.dumps(rows))`,
      ],
      {
        cwd: resolve(__dirname, '../../ai-service'),
        input: JSON.stringify(proposals),
        encoding: 'utf8',
        timeout: 15000,
      },
    );
    expect(child.status).toBe(0);
    const python = JSON.parse(child.stdout);
    for (const [i, raw] of proposals.entries()) {
      const zod = freeActionSchema.safeParse(raw);
      expect(zod.success).toBe(python[i].valid);
      if (python[i].valid)
        expect(freeActionSchema.safeParse(python[i].proposal).success).toBe(
          true,
        );
    }
  });
  it('accepts topic/act selectors without granting a write capability', () => {
    expect(
      freeActionSchema.safeParse({
        kind: 'FREE',
        intent: 'TALK',
        description: 'Perguntar',
        target: { type: 'CHARACTER', name: 'Iria' },
        tool: { type: 'DIALOGUE', topic: 'disagreement', act: 'ANSWER' },
      }).success,
    ).toBe(true);
  });
  it('accepts explicit versioned bindings in existing scene JSONB', () => {
    expect(
      scenePlanSchema.safeParse({
        opening: 'Sala.',
        presentCharacterIds: [speakerId],
        options: [],
        dialogue: [
          {
            libraryId: 'khaos-dialogue',
            contentVersion: 1,
            characterId: speakerId,
            voiceId: 'RESERVED',
            expectedState: 'UNRESOLVED',
            topics: ['disagreement'],
            sources: [],
            provenance: {
              authorId: 'fixture',
              source: 'reviewed',
              reviewed: true,
            },
          },
        ],
      }).success,
    ).toBe(true);
  });
  it('publishes a complete contextual reply without rewriting it', () => {
    expect(publicationChoices(context, confirmed)).toContainEqual(reply.beat);
    expect(
      validateRendering(
        { narrative: reply.beat.text, eventIds: [], beats: [reply.beat] },
        confirmed,
        context,
      ).accepted,
    ).toBe(true);
  });
  it('does not authorize combining contextual alternatives into an unreviewed utterance', () => {
    const second = {
      ...reply,
      id: 'other',
      beat: { ...reply.beat, text: 'Iria — Posso explicar meu ponto.' },
    };
    const richer: RenderingContext = {
      ...context,
      dialogue: { ...context.dialogue!, replies: [reply, second] },
    };
    expect(
      validateRendering(
        {
          narrative: [reply.beat.text, second.beat.text].join('\n\n'),
          eventIds: [],
          beats: [reply.beat, second.beat],
        },
        confirmed,
        richer,
      ).reason,
    ).toBe('DIALOGUE_ALTERNATIVES');
  });
});

describe('TEST-VOICE-004/005/006/007/008/009 authorizations', () => {
  const speaker = {
    id: speakerId,
    name: 'Iria',
    state: 'UNRESOLVED',
    available: true,
  };
  const source: DialogueSource = {
    kind: 'KNOWLEDGE',
    referenceId: randomUUID(),
    description: 'Iria e Naelis discordaram; o desacordo não foi resolvido.',
    characterId: speakerId,
    visibility: 'PUBLIC',
    source: 'WITNESSED',
    eventType: 'CONSEQUENCE_RECORDED',
    participants: [speakerId],
  };
  const binding: DialogueBinding = {
    libraryId: 'khaos-dialogue',
    contentVersion: 1,
    characterId: speakerId,
    voiceId: 'RESERVED',
    expectedState: 'UNRESOLVED',
    topics: ['conversation', 'disagreement', 'promise', 'surroundings'],
    sources: [
      {
        key: 'disagreement',
        kind: 'KNOWLEDGE',
        referenceId: source.referenceId,
        descriptionHash: dialogueSourceHash(source.description),
      },
    ],
    provenance: { authorId: 'fixture', source: 'reviewed', reviewed: true },
  };
  it('offers distinct reviewed voices and all eight general communicative acts', () => {
    const reserved = authorizeDialogue(binding, speaker, [source]);
    const warm = authorizeDialogue({ ...binding, voiceId: 'WARM' }, speaker, [
      source,
    ]);
    expect(
      reserved.find((r) => r.topic === 'disagreement')!.beat.text,
    ).not.toBe(warm.find((r) => r.topic === 'disagreement')!.beat.text);
    expect(
      new Set(
        reserved.filter((r) => r.topic === 'conversation').map((r) => r.act),
      ).size,
    ).toBe(8);
    expect(
      reserved
        .filter((r) => r.topic === 'disagreement')
        .every((r) => r.beat.factIds.includes(source.referenceId)),
    ).toBe(true);
  });
  it.each([
    { characterId: randomUUID() },
    { visibility: 'GM_ONLY' },
    { visibility: 'PLAYER_ONLY' },
    { source: 'HEARD' },
    { source: 'RUMOR' },
    { description: 'Outra informação.' },
    { eventType: 'SPEECH_RECORDED' },
    { participants: [randomUUID()] },
    { participants: undefined },
  ])(
    'does not promote a wrong, private, heard or changed source: %j',
    (change) => {
      expect(
        authorizeDialogue(binding, speaker, [{ ...source, ...change }]).filter(
          (r) => r.topic === 'disagreement',
        ),
      ).toEqual([]);
    },
  );
  it('refuses unmet state, identity, availability, review and version conditions', () => {
    for (const changed of [
      { ...speaker, state: 'RESOLVED' },
      { ...speaker, id: randomUUID() },
      { ...speaker, available: false },
    ])
      expect(authorizeDialogue(binding, changed, [source])).toEqual([]);
    for (const changed of [
      { ...binding, contentVersion: 2 },
      { ...binding, provenance: { ...binding.provenance, reviewed: false } },
      { ...binding, sources: [...binding.sources, ...binding.sources] },
    ])
      expect(authorizeDialogue(changed, speaker, [source])).toEqual([]);
    expect(
      authorizeDialogue(binding, speaker, []).some(
        (r) => r.topic === 'disagreement',
      ),
    ).toBe(false);
  });
  it('keeps a recorded promise as a verbatim attributed report, never an executed effect', () => {
    const promise = {
      ...source,
      referenceId: randomUUID(),
      source: 'HEARD',
      eventType: 'SPEECH_RECORDED',
      description:
        "Iria disse: pretendo ajudar quando puder. Símbolos: $& $$ $'.",
    };
    const prepared = {
      ...binding,
      sources: [
        {
          key: 'promise',
          kind: 'KNOWLEDGE',
          referenceId: promise.referenceId,
          descriptionHash: dialogueSourceHash(promise.description),
        },
      ],
    };
    const replies = authorizeDialogue(prepared, speaker, [promise]).filter(
      (r) => r.topic === 'promise',
    );
    expect(replies.length).toBeGreaterThan(0);
    expect(
      replies.every((r) => r.beat.text.includes(`> ${promise.description}`)),
    ).toBe(true);
    expect(
      replies.every((r) => r.beat.factIds[0] === promise.referenceId),
    ).toBe(true);
  });
  it('requires public accessible sources and preserves the exact public description', () => {
    const world: DialogueSource = {
      kind: 'PUBLIC',
      referenceId: randomUUID(),
      description: 'A lombada tem um selo azul.',
      visibility: 'PUBLIC',
      accessible: true,
    };
    const prepared = {
      ...binding,
      sources: [
        {
          key: 'surroundings',
          kind: 'PUBLIC',
          referenceId: world.referenceId,
          descriptionHash: dialogueSourceHash(world.description),
        },
      ],
    };
    expect(
      authorizeDialogue(prepared, speaker, [world])
        .filter((r) => r.topic === 'surroundings')
        .every((r) => r.beat.text.includes('> A lombada tem um selo azul.')),
    ).toBe(true);
    for (const change of [
      { accessible: false },
      { visibility: 'PLAYER_ONLY' },
      { visibility: 'GM_ONLY' },
    ])
      expect(
        authorizeDialogue(prepared, speaker, [{ ...world, ...change }]).filter(
          (r) => r.topic === 'surroundings',
        ),
      ).toEqual([]);
  });
});
