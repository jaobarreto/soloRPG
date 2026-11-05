import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { narrationSchema, type Narration } from '@solo-rpg/shared-contracts';
import {
  publicationChoices,
  validateRendering,
  type RenderingContext,
} from '../src/narrative/rendering';

describe('Phase 5.6.2 deterministic publication boundary', () => {
  const eventId = randomUUID();
  const confirmed = {
    narrative: 'A busca não identificou nenhuma abertura.',
    eventIds: [eventId],
  };
  const context: RenderingContext = {
    category: 'MECHANIC',
    protagonist: null,
    speaker: null,
    scene: null,
    facts: [
      { eventId, description: 'Uma estante de madeira.', source: 'WITNESSED' },
    ],
    rules: [],
  };
  const injected = (text: string, factIds: string[] = []): Narration => {
    const beats: NonNullable<Narration['beats']> = [
      {
        kind: 'RESULT',
        speakerId: null,
        text: confirmed.narrative,
        factIds: [],
      },
      { kind: 'ATMOSPHERE', speakerId: null, text, factIds },
    ];
    return {
      narrative: beats.map((b) => b.text).join('\n\n'),
      eventIds: confirmed.eventIds,
      beats,
    };
  };
  it.each([
    ['TEST-CANON-001', 'Atrás da estante existe uma passagem secreta.'],
    ['TEST-CANON-002', 'Atrás da estante há uma galeria que conduz ao jardim.'],
    ...[
      'corredor',
      'escadaria',
      'entrada oculta',
      'compartimento',
      'caminho subterrâneo',
      'sala adicional',
    ].map((s) => ['TEST-CANON-003', `Atrás da estante há um ${s}.`]),
    ['TEST-CANON-009', 'O acesso ao jardim está ao alcance de Naelis.'],
    ['TEST-CANON-009', 'A procura finalmente deu frutos.'],
  ])(
    '%s refuses unapproved prose independently of vocabulary: %s',
    (_, text) => {
      const result = validateRendering(injected(text!), confirmed, context);
      expect(result.accepted).toBe(false);
      expect(result.narration).toEqual(confirmed);
    },
  );
  it('TEST-CANON-004 valid unrelated fact IDs do not authorize a claim', () => {
    expect(
      validateRendering(
        injected('O embaixador é culpado.', [eventId]),
        confirmed,
        context,
      ).accepted,
    ).toBe(false);
  });
  const compose = (
    ctx: RenderingContext,
    predicate: (b: NonNullable<Narration['beats']>[number]) => boolean,
  ) => {
    const beats = publicationChoices(ctx, confirmed).filter(predicate);
    return {
      narrative: beats.map((b) => b.text).join('\n\n'),
      eventIds: confirmed.eventIds,
      beats,
    };
  };
  it('TEST-CANON-006 composes literal public atmosphere and a decision invitation around the result', () => {
    const ctx = {
      ...context,
      scene: 'A luz dourada envolve as lombadas gastas.',
      observations: [
        {
          description: 'A madeira conserva o brilho do verniz.',
          accessible: true,
        },
      ],
    };
    const value = compose(
      ctx,
      (b) => b.kind !== 'QUESTION' || b.text === 'Como deseja prosseguir?',
    );
    const result = validateRendering(value, confirmed, ctx);
    expect(result.accepted).toBe(true);
    expect(result.narration.narrative).toContain(ctx.scene);
    expect(result.narration.narrative).toContain(confirmed.narrative);
    expect(result.narration.narrative).toContain('brilho do verniz');
  });
  const npc = {
    id: randomUUID(),
    name: 'Mira',
    personality: 'Cautelosa e reservada',
  };
  it.each(['RUMOR', 'HEARD', 'WITNESSED'])(
    'TEST-CANON-007/008 quotes own %s knowledge with its modality',
    (source) => {
      const ctx: RenderingContext = {
        ...context,
        category: 'DIALOGUE',
        speaker: npc,
        facts: [
          {
            eventId,
            source,
            description:
              'Aren acusou Mira durante a discussão.\nEla discordou.',
          },
        ],
      };
      const value = compose(
        ctx,
        (b) => b.kind === 'DIALOGUE' && b.factIds.length > 0,
      );
      const result = validateRendering(value, confirmed, ctx);
      expect(result.accepted).toBe(true);
      expect(result.narration.narrative).toContain('Mira —');
      expect(result.narration.narrative).toContain('> Aren acusou Mira');
      if (source !== 'WITNESSED')
        expect(result.narration.narrative).toMatch(
          /não posso confirmá-lo|não comprova/,
        );
      const fabricated = structuredClone(value);
      fabricated.beats[0]!.text = 'Aren é culpado.';
      fabricated.narrative = 'Aren é culpado.';
      expect(validateRendering(fabricated, confirmed, ctx).accepted).toBe(
        false,
      );
    },
  );
  it('TEST-CANON-007 has personality, questions and disagreement, but no invented material allegations', () => {
    const ctx = { ...context, category: 'DIALOGUE', speaker: npc, facts: [] };
    const value = compose(
      ctx,
      (b) => b.kind === 'DIALOGUE' && b.text.includes('Prefiro cautela'),
    );
    expect(validateRendering(value, confirmed, ctx).accepted).toBe(true);
    const unowned = injected('Aren é culpado.', [randomUUID()]);
    unowned.beats![1]!.kind = 'DIALOGUE';
    unowned.beats![1]!.speakerId = npc.id;
    const rejected = validateRendering(unowned, confirmed, ctx);
    expect(rejected.accepted).toBe(false);
    expect(rejected.narration.narrative).toContain('Prefiro cautela');
    expect(rejected.narration.narrative).not.toContain('culpado');
  });
  it('does not trust echoed catalogs or accessible=false descriptions', () => {
    const raw = injected('Há outra sala.');
    const ctx = {
      ...context,
      observations: [{ description: 'SECRET', accessible: false }, null, {}],
      publication: { version: 1 as const, choices: raw.beats! },
    };
    expect(validateRendering(raw, confirmed, ctx).accepted).toBe(false);
    expect(JSON.stringify(publicationChoices(ctx, confirmed))).not.toContain(
      'SECRET',
    );
  });
  it.each(['Afetuosa', 'Direta', ''])(
    'can select reviewed voices without publishing profile prose: %s',
    (personality) => {
      const ctx = {
        ...context,
        category: 'DIALOGUE',
        speaker: { ...npc, personality },
      };
      const value = compose(
        ctx,
        (b) => b.kind === 'DIALOGUE' && !b.factIds.length,
      );
      expect(validateRendering(value, confirmed, ctx).accepted).toBe(true);
    },
  );
  it('rejects repeated fragments and dialogue without an attributed reply', () => {
    const value = injected('Uma estante de madeira.');
    value.beats = [value.beats![0]!, value.beats![0]!];
    value.narrative = value.beats.map((b) => b.text).join('\n\n');
    expect(
      validateRendering(value, confirmed, {
        ...context,
        category: 'DIALOGUE',
        speaker: npc,
      }).reason,
    ).toBe('REPEATED_SEGMENT');
    expect(
      validateRendering(confirmed, confirmed, {
        ...context,
        category: 'DIALOGUE',
        speaker: npc,
      }).narration.narrative,
    ).toContain('Mira —');
    const missing = compose(
      { ...context, category: 'DIALOGUE', speaker: npc },
      (b) => b.kind === 'QUESTION',
    );
    expect(
      validateRendering(missing, confirmed, {
        ...context,
        category: 'DIALOGUE',
        speaker: npc,
      }).reason,
    ).toBe('MISSING_REPLY');
  });
  it('preserves the strict Python/Zod wire contract for every publication beat and legacy narration', () => {
    const ctx = { ...context, category: 'DIALOGUE', speaker: npc };
    const values: unknown[] = [
      confirmed,
      ...publicationChoices(ctx, confirmed).map((b) => ({
        narrative: b.text,
        eventIds: confirmed.eventIds,
        beats: [b],
      })),
      {
        narrative: 'Texto OOC.',
        eventIds: [],
        beats: [
          { kind: 'OOC', speakerId: null, text: 'Texto OOC.', factIds: [] },
        ],
      },
    ];
    const invalid = [
      { ...confirmed, admin: true },
      {
        narrative: 'Inválido.',
        eventIds: [],
        beats: [
          { kind: 'ADMIN', speakerId: null, text: 'Inválido.', factIds: [] },
        ],
      },
    ];
    const child = spawnSync(
      resolve(__dirname, '../../ai-service/.venv/bin/python'),
      [
        '-c',
        `import json, sys
from app.narrative.schemas import Narration
from pydantic import ValidationError
rows = []
for item in json.load(sys.stdin):
    try:
        rows.append(Narration.model_validate(item).model_dump(mode="json"))
    except ValidationError:
        rows.append(None)
print(json.dumps(rows))`,
      ],
      {
        cwd: resolve(__dirname, '../../ai-service'),
        encoding: 'utf8',
        input: JSON.stringify([...values, ...invalid]),
        timeout: 15000,
      },
    );
    expect(child.status).toBe(0);
    const rows = JSON.parse(child.stdout);
    values.forEach((value, i) => {
      expect(narrationSchema.parse(rows[i])).toEqual(
        narrationSchema.parse(value),
      );
    });
    invalid.forEach((value, i) => {
      expect(rows[values.length + i]).toBeNull();
      expect(narrationSchema.safeParse(value).success).toBe(false);
    });
  });
});
