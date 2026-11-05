import { randomUUID } from 'node:crypto';
import { freeActionSchema, type Narration } from '@solo-rpg/shared-contracts';
import { interpretFreeAction } from '../src/narrative/free-action';
import {
  publicationChoices,
  validateRendering,
} from '../src/narrative/rendering';

const pc = {
  id: randomUUID(),
  name: 'Naelis',
  kind: 'PROTAGONIST',
  knowledge: [],
};
const mira = {
  id: randomUUID(),
  name: 'Mira',
  kind: 'COMPANION',
  knowledge: [],
};
const snapshot = {
  characters: [pc, mira],
  world: [],
  options: [],
  combat: null,
};
const free = (
  intent = 'TALK',
  tool: object = { type: 'DIALOGUE' },
  target: object | null = { type: 'CHARACTER', name: 'Mira' },
) =>
  freeActionSchema.parse({
    kind: 'FREE',
    intent,
    description: 'Perguntar sobre Aren',
    target,
    tool,
  });

describe('Free action planning without prepared choices', () => {
  it('resolves a named present NPC on the server', () => {
    const result = interpretFreeAction(free(), 'SPEAK', snapshot);
    expect(result).toMatchObject({ category: 'DIALOGUE', targetId: mira.id });
  });
  it('does not invent targets, accept IDs, or choose between duplicate names', () => {
    expect(
      interpretFreeAction(
        free('TALK', { type: 'DIALOGUE' }, { type: 'CHARACTER', name: 'Aren' }),
        'SPEAK',
        snapshot,
      ).category,
    ).toBe('CLARIFY');
    expect(
      interpretFreeAction(free(), 'SPEAK', {
        ...snapshot,
        characters: [...snapshot.characters, { ...mira, id: randomUUID() }],
      }).category,
    ).toBe('CLARIFY');
    expect(
      freeActionSchema.safeParse({
        ...free(),
        target: { type: 'CHARACTER', id: mira.id },
      }).success,
    ).toBe(false);
  });
  it('does not run mechanics for private thought or OOC', () => {
    for (const mode of ['THINK', 'OUT_OF_CHARACTER'] as const)
      expect(
        interpretFreeAction(
          free('REST', { type: 'REST', kind: 'SLEEP' }, null),
          mode,
          snapshot,
        ).command,
      ).toBeUndefined();
  });
  it('asks which arcanum instead of consuming resources', () => {
    const result = interpretFreeAction(
      free(
        'ARCANA',
        { type: 'CLARIFY', question: 'Qual arcano deseja utilizar e em quem?' },
        null,
      ),
      'ACT',
      snapshot,
    );
    expect(result.category).toBe('CLARIFY');
    expect(result.command).toBeUndefined();
    expect(
      interpretFreeAction(
        free(
          'ARCANA',
          { type: 'CLARIFY', question: 'SEGREDO DO PLANNER' },
          null,
        ),
        'ACT',
        snapshot,
      ).text,
    ).not.toContain('SEGREDO');
    expect(
      interpretFreeAction(
        free(
          'TALK',
          { type: 'DIALOGUE' },
          { type: 'CHARACTER', name: 'SEGREDO DO PLANNER' },
        ),
        'ACT',
        snapshot,
      ).text,
    ).not.toContain('SEGREDO');
  });
  it('builds a shield command with the actual protagonist ID', () => {
    expect(
      interpretFreeAction(
        free(
          'ARCANA',
          { type: 'ARCANA', arcanum: 'psychic-shield', raised: true },
          null,
        ),
        'ACT',
        snapshot,
      ).command,
    ).toEqual({
      type: 'ARCANA_USE',
      input: { characterId: pc.id, arcanum: 'psychic-shield', raised: true },
    });
  });
  it('does not turn investigation into a successful discovery', () => {
    const result = interpretFreeAction(
      free('INVESTIGATE', { type: 'OBSERVE' }, null),
      'ACT',
      snapshot,
    );
    expect(result.category).toBe('OBSERVE');
    expect(result.command).toBeUndefined();
  });
  it('keeps unsupported and impossible consequences under adjudication', () => {
    expect(
      interpretFreeAction(
        free('OTHER', { type: 'ADJUDICATE' }, null),
        'ACT',
        snapshot,
      ).category,
    ).toBe('ADJUDICATE');
  });
  it.each([
    ['Conversar', 'TALK', { type: 'DIALOGUE' }, 'DIALOGUE'],
    ['Investigar objeto', 'INVESTIGATE', { type: 'OBSERVE' }, 'OBSERVE'],
    ['Examinar ambiente', 'OBSERVE', { type: 'OBSERVE' }, 'OBSERVE'],
    [
      'Usar arcano',
      'ARCANA',
      { type: 'ARCANA', arcanum: 'psychic-shield', raised: true },
      'MECHANIC',
    ],
    [
      'Atacar sem encontro',
      'ATTACK',
      { type: 'COMBAT', action: 'ATTACK' },
      'ADJUDICATE',
    ],
    [
      'Defender sem encontro',
      'DEFEND',
      { type: 'COMBAT', action: 'DEFEND' },
      'ADJUDICATE',
    ],
    ['Descansar', 'REST', { type: 'REST', kind: 'BREATHER' }, 'MECHANIC'],
    ['Esperar', 'WAIT', { type: 'WAIT', minutes: 5 }, 'MECHANIC'],
    ['Explorar', 'EXPLORE', { type: 'OBSERVE' }, 'OBSERVE'],
    ['Deslocar-se', 'MOVE', { type: 'ADJUDICATE' }, 'ADJUDICATE'],
    ['Recusar proposta', 'REFUSE', { type: 'DIALOGUE' }, 'DIALOGUE'],
    ['Negociar', 'NEGOTIATE', { type: 'DIALOGUE' }, 'DIALOGUE'],
    ['Mentir', 'LIE', { type: 'DIALOGUE' }, 'DIALOGUE'],
    ['Ajudar NPC', 'HELP', { type: 'DIALOGUE' }, 'DIALOGUE'],
    ['Pergunta OOC', 'OOC', { type: 'QUERY', subject: 'RULES' }, 'OOC'],
    [
      'Corrigir interpretação',
      'CORRECT',
      { type: 'QUERY', subject: 'RULES' },
      'OOC',
    ],
    ['Descrever pensamento', 'THINK', { type: 'OBSERVE' }, 'THINK'],
    ['Ação impossível', 'OTHER', { type: 'ADJUDICATE' }, 'ADJUDICATE'],
    [
      'Ação ambígua',
      'ARCANA',
      { type: 'CLARIFY', question: 'Qual arcano?' },
      'CLARIFY',
    ],
    ['Ação não prevista', 'INTERACT', { type: 'OBSERVE' }, 'OBSERVE'],
  ])(
    '%s: restricts intent %s to an authorized resolution',
    (_label, intent, tool, category) => {
      expect(
        interpretFreeAction(free(intent, tool), 'ACT', snapshot).category,
      ).toBe(category);
    },
  );
  it('resolves visible world objects and inventory, and does not guess missing targets', () => {
    const world = { id: randomUUID(), name: 'Porta' };
    const item = { itemId: randomUUID(), name: 'Corda' };
    expect(
      interpretFreeAction(
        free(
          'OBSERVE',
          { type: 'QUERY', subject: 'LOCATION' },
          { type: 'WORLD', name: 'Porta' },
        ),
        'ACT',
        { ...snapshot, world: [world] },
      ).targetId,
    ).toBe(world.id);
    expect(
      interpretFreeAction(
        free(
          'OBSERVE',
          { type: 'QUERY', subject: 'INVENTORY' },
          { type: 'ITEM', name: 'Corda' },
        ),
        'ACT',
        { ...snapshot, characters: [{ ...pc, inventory: [item] }] },
      ).targetId,
    ).toBe(item.itemId);
    expect(
      interpretFreeAction(
        free('TALK', { type: 'DIALOGUE' }, null),
        'SPEAK',
        snapshot,
      ).category,
    ).toBe('CLARIFY');
    expect(
      interpretFreeAction(
        free(
          'TALK',
          { type: 'DIALOGUE' },
          { type: 'CHARACTER', name: 'Naelis' },
        ),
        'SPEAK',
        snapshot,
      ).category,
    ).toBe('CLARIFY');
    expect(
      interpretFreeAction(
        free('ATTACK', { type: 'OBSERVE' }, null),
        'ACT',
        snapshot,
      ).category,
    ).toBe('ADJUDICATE');
    expect(
      interpretFreeAction(free('OTHER', { type: 'DIALOGUE' }), 'ACT', snapshot)
        .category,
    ).toBe('ADJUDICATE');
  });
  it('requires an ACT decision and does not infer food, shield direction, or arcane parameters', () => {
    expect(
      interpretFreeAction(
        free('REST', { type: 'REST', kind: 'BREATHER' }, null),
        'SPEAK',
        snapshot,
      ).category,
    ).toBe('CLARIFY');
    expect(
      interpretFreeAction(
        free('REST', { type: 'REST', kind: 'LIGHT_REST' }, null),
        'ACT',
        snapshot,
      ).category,
    ).toBe('CLARIFY');
    expect(
      interpretFreeAction(
        free(
          'REST',
          { type: 'REST', kind: 'LIGHT_REST', sustenanceConfirmed: true },
          null,
        ),
        'ACT',
        snapshot,
      ).command,
    ).toMatchObject({ type: 'REST', sustenanceConfirmed: true });
    for (const arcanum of [
      'psychic-shield',
      'cure',
      'psychic-contact',
      'body-control',
    ])
      expect(
        interpretFreeAction(
          free('ARCANA', { type: 'ARCANA', arcanum }, null),
          'ACT',
          snapshot,
        ).category,
      ).toBe('CLARIFY');
    for (const arcanum of ['move-object', 'wind-shaping'])
      expect(
        interpretFreeAction(
          free('ARCANA', { type: 'ARCANA', arcanum }, null),
          'ACT',
          snapshot,
        ).category,
      ).toBe('ADJUDICATE');
    expect(
      interpretFreeAction(
        free('ARCANA', { type: 'ARCANA', arcanum: 'second-sight' }, null),
        'ACT',
        snapshot,
      ).command,
    ).toMatchObject({
      type: 'ARCANA_USE',
      input: { arcanum: 'second-sight', characterId: pc.id },
    });
    expect(
      interpretFreeAction(
        free('ARCANA', { type: 'ARCANA', arcanum: 'cure' }),
        'ACT',
        snapshot,
      ).command,
    ).toMatchObject({ type: 'CURE', targetId: mira.id });
    expect(
      interpretFreeAction(
        free('ARCANA', {
          type: 'ARCANA',
          arcanum: 'psychic-contact',
          tradition: 'PSYCHIC',
        }),
        'ACT',
        snapshot,
      ).command,
    ).toMatchObject({ type: 'ARCANA_USE', input: { targetId: mira.id } });
    expect(
      interpretFreeAction(
        free('ARCANA', {
          type: 'ARCANA',
          arcanum: 'body-control',
          tradition: 'HEALING',
          use: 'IGNORE_PAIN',
        }),
        'ACT',
        snapshot,
      ).command,
    ).toMatchObject({ type: 'ARCANA_USE', input: { use: 'IGNORE_PAIN' } });
  });
  it('selects only a matching prepared check, and uses the actual combat encounter', () => {
    const option = {
      id: randomUUID(),
      intent: 'Examinar a porta',
      mode: 'ACT',
      requiresCheck: true,
    };
    const check = free(
      'INVESTIGATE',
      { type: 'PREPARED_CHECK', capability: option.intent },
      null,
    );
    expect(
      interpretFreeAction(check, 'ACT', { ...snapshot, options: [option] })
        .optionId,
    ).toBe(option.id);
    expect(interpretFreeAction(check, 'ACT', snapshot).category).toBe(
      'ADJUDICATE',
    );
    const combat = { id: randomUUID() };
    expect(
      interpretFreeAction(
        free('ATTACK', { type: 'COMBAT', action: 'ATTACK' }),
        'ACT',
        { ...snapshot, combat },
      ).combat,
    ).toMatchObject({
      actorId: pc.id,
      targetId: mira.id,
      encounterId: combat.id,
    });
    expect(
      interpretFreeAction(
        free('ATTACK', { type: 'COMBAT', action: 'ATTACK' }, null),
        'ACT',
        { ...snapshot, combat },
      ).category,
    ).toBe('CLARIFY');
    expect(
      interpretFreeAction(
        free('DEFEND', { type: 'COMBAT', action: 'DEFEND' }, null),
        'ACT',
        { ...snapshot, combat },
      ).combat,
    ).toMatchObject({ action: 'DEFEND' });
  });
});

describe('Contextual dialogue authorization after PROPOSE', () => {
  const aren = { ...mira, id: randomUUID(), name: 'Aren' };
  const choice = { topic: 'disagreement', act: 'ANSWER' } as const;
  const clarification = { topic: 'conversation', act: 'CLARIFY' } as const;
  const current = {
    ...snapshot,
    characters: [...snapshot.characters, aren],
    dialogue: [
      {
        characterId: mira.id,
        name: mira.name,
        choices: [choice, clarification],
      },
      {
        characterId: aren.id,
        name: aren.name,
        choices: [{ topic: 'promise', act: 'ANSWER' } as const],
      },
    ],
  };
  const propose = (name: string, selectors: object) =>
    free(
      'TALK',
      { type: 'DIALOGUE', ...selectors },
      { type: 'CHARACTER', name },
    );

  it('accepts only contextual pairs belonging to the resolved speaker', () => {
    for (const [name, selectors, id] of [
      [mira.name, choice, mira.id],
      [mira.name, clarification, mira.id],
      [aren.name, { topic: 'promise', act: 'ANSWER' }, aren.id],
    ] as const) {
      const result = interpretFreeAction(
        propose(name, selectors),
        'SPEAK',
        current,
      );
      expect(result).toMatchObject({ category: 'DIALOGUE', targetId: id });
      expect(result.command).toBeUndefined();
    }
    for (const [name, selectors] of [
      [mira.name, { ...choice, act: 'CLARIFY' }],
      [aren.name, choice],
      [mira.name, { topic: 'promise', act: 'ANSWER' }],
      [mira.name, { topic: choice.topic }],
    ] as const) {
      const result = interpretFreeAction(
        propose(name, selectors),
        'SPEAK',
        current,
      );
      expect(result).toMatchObject({
        category: 'CLARIFY',
        reason: 'UNAUTHORIZED_DIALOGUE_SELECTION',
      });
      expect(result.command).toBeUndefined();
    }
  });

  it('refuses the same selector after revocation, preserving legacy dialogue', () => {
    const request = propose(mira.name, choice);
    expect(interpretFreeAction(request, 'SPEAK', current).category).toBe(
      'DIALOGUE',
    );
    const revoked = {
      ...current,
      dialogue: [{ ...current.dialogue[0]!, choices: [clarification] }],
    };
    expect(interpretFreeAction(request, 'SPEAK', revoked)).toMatchObject({
      category: 'CLARIFY',
      reason: 'UNAUTHORIZED_DIALOGUE_SELECTION',
    });
    const legacy = interpretFreeAction(
      propose(mira.name, {}),
      'SPEAK',
      revoked,
    );
    expect(legacy).toMatchObject({ category: 'DIALOGUE', targetId: mira.id });
    expect(legacy.command).toBeUndefined();
  });
});

describe('Post-commit literary validation', () => {
  const context = {
    category: 'DIALOGUE',
    protagonist: pc,
    speaker: mira,
    scene: 'Uma fogueira.',
    facts: [],
    rules: [],
  };
  const confirmed = {
    narrative: 'Mira ouviu a pergunta de Naelis.',
    eventIds: [],
  };
  const draft = (
    text: string,
    speakerId: string | null = mira.id,
  ): Narration => ({
    narrative: text,
    eventIds: [],
    beats: [{ kind: 'DIALOGUE', speakerId, text, factIds: [] }],
  });
  it('allows an expressive reply selected from server-owned publication choices', () => {
    const beat = publicationChoices(context, confirmed).find(
      (b) => b.kind === 'DIALOGUE',
    )!;
    expect(
      validateRendering(
        { ...draft(beat.text), beats: [beat] },
        confirmed,
        context,
      ).accepted,
    ).toBe(true);
  });
  it('allows an invitation alongside attributed speech, but rejects a hidden decision', () => {
    const choices = publicationChoices(context, confirmed);
    const beats = [
      choices.find((b) => b.kind === 'DIALOGUE')!,
      choices.find((b) => b.kind === 'QUESTION')!,
    ];
    expect(
      validateRendering(
        {
          narrative: beats.map((b) => b.text).join('\n\n'),
          eventIds: [],
          beats,
        },
        confirmed,
        context,
      ).accepted,
    ).toBe(true);
    expect(
      validateRendering(
        draft('Naelis aceita a proposta. O que você deseja fazer?'),
        confirmed,
        context,
      ).accepted,
    ).toBe(false);
  });
  it.each([
    'Naelis aceita a proposta e decide acompanhar Aren.',
    'Você sente medo e confia em Aren.',
    'Mira entrega uma espada a Naelis.',
    'O teste foi bem-sucedido e o alvo perde 8 pontos de Vida.',
    'A missão foi concluída.',
  ])('rejects unsupported agency or consequences: %s', (text) => {
    expect(validateRendering(draft(text), confirmed, context).accepted).toBe(
      false,
    );
  });
  it('rejects absent speakers and unowned knowledge references', () => {
    expect(
      validateRendering(draft('Olá', randomUUID()), confirmed, context)
        .accepted,
    ).toBe(false);
    const value = draft('Sei disso.');
    value.beats![0]!.factIds.push(randomUUID());
    expect(validateRendering(value, confirmed, context).accepted).toBe(false);
  });
  it('does not let prose replace a failed official result', () => {
    expect(
      validateRendering(
        draft('O teste foi um sucesso.'),
        { narrative: 'O teste falhou.', eventIds: [] },
        { ...context, category: 'MECHANIC' },
      ).accepted,
    ).toBe(false);
  });
  it('requires exact event references, assembled beats, and a literal mechanical result', () => {
    const value = draft('Mira hesita.');
    expect(
      validateRendering(
        { ...value, eventIds: [randomUUID()] },
        confirmed,
        context,
      ).reason,
    ).toBe('EVENT_REFERENCES');
    expect(
      validateRendering(
        { ...value, narrative: 'Outro texto.' },
        confirmed,
        context,
      ).reason,
    ).toBe('BEAT_TEXT');
    expect(
      validateRendering(
        { narrative: 'Outro texto.', eventIds: [] },
        confirmed,
        context,
      ).reason,
    ).toBe('BEAT_TEXT');
    expect(
      validateRendering({ ...value, extra: true }, confirmed, context).reason,
    ).toBe('INVALID_SCHEMA');
    const mechanical: Narration = {
      ...confirmed,
      beats: [
        {
          kind: 'RESULT',
          speakerId: null,
          text: confirmed.narrative,
          factIds: [],
        },
      ],
    };
    expect(
      validateRendering(mechanical, confirmed, {
        ...context,
        category: 'MECHANIC',
      }).accepted,
    ).toBe(true);
    expect(validateRendering(confirmed, confirmed, context).reason).toBe(
      'MISSING_REPLY',
    );
    expect(
      validateRendering(value, confirmed, { ...context, category: 'CLARIFY' })
        .accepted,
    ).toBe(false);
  });
  it('preserves rumor uncertainty and isolates OOC beats', () => {
    const eventId = randomUUID();
    const rumors = {
      ...context,
      facts: [{ eventId, description: 'Rumor sobre Aren.', source: 'RUMOR' }],
    };
    const value = draft('Aren esteve aqui.');
    value.beats![0]!.factIds = [eventId];
    expect(validateRendering(value, confirmed, rumors).reason).toBe(
      'UNAPPROVED_SEGMENT',
    );
    const authorized = publicationChoices(rumors, confirmed).find((b) =>
      b.factIds.includes(eventId),
    )!;
    value.narrative = authorized.text;
    value.beats = [authorized];
    expect(validateRendering(value, confirmed, rumors).accepted).toBe(true);
    value.beats![0]!.kind = 'OOC';
    expect(validateRendering(value, confirmed, rumors).reason).toBe(
      'OOC_BOUNDARY',
    );
    value.beats![0]!.factIds = [];
    expect(
      validateRendering(value, confirmed, {
        ...context,
        category: 'OOC',
        speaker: null,
      }).accepted,
    ).toBe(false);
    value.beats![0]!.speakerId = null;
    value.narrative = value.beats![0]!.text = confirmed.narrative;
    expect(
      validateRendering(value, confirmed, {
        ...context,
        category: 'OOC',
        speaker: null,
      }).accepted,
    ).toBe(true);
  });
});

describe('TEST-55-018 explicit reference binding', () => {
  const twin = { ...mira, id: randomUUID() };
  const ref = {
    type: 'CHARACTER' as const,
    entityId: twin.id,
    label: 'Mira',
    literal: '@Mira',
    start: 0,
    end: 5,
  };
  it('binds one selected homonym and rejects substitution with another available name', () => {
    const context = {
      ...snapshot,
      characters: [
        ...snapshot.characters,
        twin,
        { ...mira, id: randomUUID(), name: 'Outra' },
      ],
    };
    expect(interpretFreeAction(free(), 'SPEAK', context, [ref])).toMatchObject({
      category: 'DIALOGUE',
      targetId: twin.id,
    });
    expect(
      interpretFreeAction(
        free(
          'TALK',
          { type: 'DIALOGUE' },
          { type: 'CHARACTER', name: 'Outra' },
        ),
        'SPEAK',
        context,
        [ref],
      ).category,
    ).toBe('CLARIFY');
    expect(interpretFreeAction(free(), 'SPEAK', context).category).toBe(
      'CLARIFY',
    );
    expect(
      interpretFreeAction(free(), 'SPEAK', context, [
        ref,
        { ...ref, entityId: mira.id },
      ]).category,
    ).toBe('CLARIFY');
  });
});
