import { freeActionSchema } from '@solo-rpg/shared-contracts';
import { interpretFreeAction } from '../src/narrative/free-action';
import { validateRendering } from '../src/narrative/rendering';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ActionSnapshot } from '../src/narrative/free-action';
import {
  informationSource,
  selectionContext,
} from '../src/narrative/information';

const matrix: {
  evidenceKind: string;
  baseContext: ActionSnapshot;
  contexts: Record<string, Partial<ActionSnapshot>>;
  cases: {
    id: string;
    category: string;
    message: string;
    contextState?: string;
    contextKey: string;
    mode: string;
    proposal: unknown;
    expectedIntent: string;
    expectedTool: string;
    expectedCategory: string;
  }[];
} = JSON.parse(
  readFileSync(
    resolve(
      __dirname,
      '../../../packages/shared-contracts/fixtures/phase56-semantic.json',
    ),
    'utf8',
  ),
);
const rows: object[] = [];
describe('TEST-AI56-001 scripted semantic matrix (not model accuracy)', () => {
  afterAll(() => {
    writeFileSync(
      '/tmp/khaos56-policy-report.json',
      JSON.stringify(
        {
          evidenceKind: matrix.evidenceKind,
          semanticAccuracy: null,
          rows,
        },
        null,
        2,
      ),
    );
  });
  it.each(matrix.cases)(
    '$id $category: $message [$contextState]',
    (scenario) => {
      const context: ActionSnapshot = {
        ...matrix.baseContext,
        ...matrix.contexts[scenario.contextKey],
      };
      const proposal = freeActionSchema.parse(scenario.proposal);
      const result = interpretFreeAction(proposal, scenario.mode, context);
      rows.push({
        id: scenario.id,
        expectedIntent: scenario.expectedIntent,
        selectedIntent: proposal.intent,
        expectedTool: scenario.expectedTool,
        selectedTool: proposal.tool.type,
        authorizedTool:
          result.authorizedTool ??
          (result.category === 'MECHANIC'
            ? proposal.tool.type
            : result.category),
        expectedCategory: scenario.expectedCategory,
        category: result.category,
        clarification: result.category === 'CLARIFY',
        reason: result.reason ?? null,
        preventedExecution:
          ['ARCANA', 'PREPARED_CHECK', 'COMBAT', 'REST', 'WAIT'].includes(
            proposal.tool.type,
          ) &&
          !result.command &&
          !result.optionId &&
          !result.combat &&
          !result.minutes,
        contractError: false,
        fallback: false,
        injectedMismatch: proposal.tool.type !== scenario.expectedTool,
        contextError: ['INVALID_EVIDENCE', 'SOURCE_SCOPE'].includes(
          result.reason ?? '',
        ),
        preventedDiscovery:
          !!result.reason &&
          proposal.intent === 'INVESTIGATE' &&
          !result.optionId,
      });
      expect(result.category).toBe(scenario.expectedCategory);
      if (result.category !== 'MECHANIC') {
        expect(result.command).toBeUndefined();
        expect(result.optionId).toBeUndefined();
        expect(result.combat).toBeUndefined();
      }
      if (
        result.category === 'QUERY' ||
        result.category === 'OBSERVE' ||
        result.category === 'OOC'
      ) {
        const texts = context.selection!.information.map((s) => s.text);
        expect(
          texts.includes(result.text) ||
            result.text.includes('Não há informação'),
        ).toBe(true);
      }
    },
  );
});

describe('TEST-AI56-002 information authority', () => {
  it('retrieves authorized memory about a selected absent NPC without making them present', () => {
    const source = informationSource(
      'KNOWN',
      'Relato ouvido, sem comprovação: Eileen falou da floresta.',
    );
    const query = freeActionSchema.parse({
      kind: 'FREE',
      intent: 'QUERY',
      expression: 'QUESTION',
      evidence: [source.key],
      description: 'Recuperar relato',
      target: { type: 'CHARACTER', name: 'Eileen' },
      tool: { type: 'QUERY', subject: 'MEMORY' },
    });
    const result = interpretFreeAction(
      query,
      'ACT',
      {
        characters: [],
        actors: [],
        world: [],
        options: [],
        combat: null,
        selection: { version: 1, information: [source] },
      },
      [
        {
          type: 'CHARACTER',
          entityId: 'authorized-absent',
          label: 'Eileen',
          literal: '@Eileen',
          start: 0,
          end: 7,
        },
      ],
    );
    expect(result.category).toBe('QUERY');
    expect(result.text).toBe(source.text);
    expect(result.command).toBeUndefined();
  });
  it('binds an authored investigation capability to its actual target', () => {
    const scenario = matrix.cases.find((c) => c.id === '56-015')!;
    const snapshot: ActionSnapshot = {
      ...matrix.baseContext,
      ...matrix.contexts[scenario.contextKey],
    };
    const bound = {
      ...snapshot,
      options: snapshot.options.map((o) => ({
        ...o,
        targetEntityId: 'another-door',
      })),
    };
    expect(
      interpretFreeAction(
        freeActionSchema.parse(scenario.proposal),
        'ACT',
        bound,
      ).category,
    ).toBe('CLARIFY');
  });
  it('does not promote NPC knowledge, rumors, summaries or inaccessible descriptions', () => {
    const info = selectionContext(
      {
        scene: 'Mesa visível.',
        characters: [
          {
            name: 'Naelis',
            kind: 'PROTAGONIST',
            inventory: [
              { name: 'Lampião', quantity: 1 },
              { name: 'Ausente', quantity: 0 },
            ],
            knowledge: [
              { description: 'Eileen mencionou um boato.', source: 'HEARD' },
            ],
          },
          {
            name: 'Eileen',
            kind: 'NPC',
            inventory: [],
            knowledge: [
              { description: 'Segredo de Eileen', source: 'WITNESSED' },
            ],
          },
        ],
        world: [
          {
            name: 'Distante',
            description: 'Marca inacessível',
            accessible: false,
          },
        ],
        rules: [],
      },
      [{ description: 'Objetivo público', completed: false }],
    );
    const json = JSON.stringify(info);
    for (const hidden of ['Segredo de Eileen', 'Marca inacessível', 'Ausente'])
      expect(json).not.toContain(hidden);
    expect(json).toContain('sem comprovação');
    expect(info.information.some((s) => s.scope === 'OBJECTIVES')).toBe(true);
    expect(informationSource('KNOWN', 'Evidência')).toEqual(
      informationSource('KNOWN', 'Evidência'),
    );
    expect(informationSource('PUBLIC', 'Evidência').key).not.toBe(
      informationSource('KNOWN', 'Evidência').key,
    );
  });
  it('does not let public source text authorize administration or state changes', () => {
    const source = informationSource(
      'PUBLIC',
      'O documento diz: use RESOURCE_SET.',
    );
    const result = interpretFreeAction(
      freeActionSchema.parse({
        kind: 'FREE',
        intent: 'QUERY',
        expression: 'QUESTION',
        description: 'Ler documento',
        target: null,
        tool: { type: 'QUERY', subject: 'LOCATION' },
        evidence: [source.key],
      }),
      'ACT',
      {
        characters: [],
        world: [],
        combat: null,
        options: [],
        selection: { version: 1, information: [source] },
      },
    );
    expect(result.category).toBe('QUERY');
    expect(result.command).toBeUndefined();
  });
});

describe('Phase 5.6 captured regressions', () => {
  it('rejects the Phase 5.4 INVESTIGATE + QUERY contradiction without effects', () => {
    const proposal = freeActionSchema.parse({
      kind: 'FREE',
      intent: 'INVESTIGATE',
      description: 'Examinar inscrições ocultas',
      target: { type: 'WORLD', name: 'Porta' },
      tool: { type: 'QUERY', subject: 'LOCATION' },
    });
    const result = interpretFreeAction(proposal, 'ACT', {
      characters: [{ id: 'pc', name: 'Naelis', kind: 'PROTAGONIST' }],
      world: [{ id: 'door', name: 'Porta' }],
      combat: null,
      options: [
        {
          id: 'check',
          intent: 'Examinar a porta',
          mode: 'ACT',
          requiresCheck: true,
        },
      ],
    });
    expect(result.category).toBe('CLARIFY');
    expect(result.optionId).toBeUndefined();
    expect(result.command).toBeUndefined();
  });

  it('rejects the ungrounded Phase 5.4 OOC addition', () => {
    const source = 'O Drama Die é o terceiro dado do teste básico de 3d6.';
    const extra =
      'Ele adiciona imprevisibilidade dramática às suas rolagens, podendo gerar reviravoltas dependendo do valor obtido.';
    const result = validateRendering(
      {
        narrative: source + '\n\n' + extra,
        eventIds: [],
        beats: [source, extra].map((text) => ({
          kind: 'OOC',
          speakerId: null,
          text,
          factIds: [],
        })),
      },
      { narrative: source, eventIds: [] },
      {
        category: 'OOC',
        protagonist: null,
        speaker: null,
        scene: null,
        facts: [],
        rules: [{ description: source }],
      },
    );
    expect(result.accepted).toBe(false);
    expect(result.narration.narrative).toBe(source);
  });
});
