import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { z } from 'zod';
import { freeActionSchema, type FreeAction } from '@solo-rpg/shared-contracts';
import { interpretFreeAction } from '../src/narrative/free-action';

const root = resolve(__dirname, '../../..');
const read = (path: string) =>
  JSON.parse(readFileSync(resolve(root, path), 'utf8'));
const plan = read('docs/ai/phase-5.6.1-plan.json');
const cases = read(
  'packages/shared-contracts/fixtures/phase5611-semantics.json',
);
const memory = plan.cases[0];
const shield = plan.cases[5];
const parse = (tool: object): FreeAction =>
  freeActionSchema.parse({ ...shield.offlineProposal, tool });
const decide = (tool: object) =>
  interpretFreeAction(parse(tool), 'ACT', shield.request.context);

describe('TEST-SEM5611: free interpretation precision without output repair', () => {
  it('rejects the frozen extra tradition explicitly before constructing an engine command', () => {
    const row = read(
      'docs/ai/phase-5.6.1-completion-live-result.json',
    ).rows.find((r: { id: string }) => r.id === '561-06');
    const raw = JSON.parse(row.rawResponse);
    const before = structuredClone(raw);
    expect(
      interpretFreeAction(
        freeActionSchema.parse(raw),
        'ACT',
        shield.request.context,
      ),
    ).toMatchObject({
      category: 'CLARIFY',
      reason: 'ARCANA_PARAMETER_MISMATCH',
    });
    expect(decide(raw.tool).command).toBeUndefined();
    expect(raw).toEqual(before);
    expect(raw.tool.tradition).toBe('PSYCHIC');
  });

  for (const [arcanum, allowed] of Object.entries(cases.arcanaParameters)) {
    for (const [field, value] of Object.entries(cases.parameterValues)) {
      if ((allowed as string[]).includes(field)) continue;
      it(`explicitly rejects ${field}=${value} on ${arcanum}, including false/zero`, () => {
        const tool = { type: 'ARCANA', arcanum, [field]: value };
        expect(decide(tool)).toMatchObject({
          category: 'CLARIFY',
          reason: 'ARCANA_PARAMETER_MISMATCH',
        });
        expect(decide(tool).command).toBeUndefined();
      });
    }
  }

  it.each([true, false])(
    'keeps legitimate raised=%s and null compatibility',
    (raised) => {
      const result = decide({
        type: 'ARCANA',
        arcanum: 'psychic-shield',
        raised,
        tradition: null,
        use: null,
        fatigue: null,
        category: null,
      });
      expect(result.command).toEqual({
        type: 'ARCANA_USE',
        input: {
          arcanum: 'psychic-shield',
          characterId: shield.request.context.characters[0].id,
          raised,
        },
      });
    },
  );

  it('preserves omitted and contradictory parameter refusals for other arcana', () => {
    for (const tool of [
      { arcanum: 'psychic-shield' },
      { arcanum: 'psychic-contact' },
      { arcanum: 'body-control' },
      { arcanum: 'psychic-contact', tradition: 'HEALING' },
      { arcanum: 'body-control', tradition: 'PSYCHIC', use: 'SLEEP' },
    ])
      expect(decide({ type: 'ARCANA', ...tool }).command).toBeUndefined();
    for (const tool of cases.validTools) {
      const proposal = parse(tool);
      if (['psychic-contact', 'body-control', 'cure'].includes(tool.arcanum))
        proposal.target = { type: 'CHARACTER', name: 'Eileen' };
      const result = interpretFreeAction(
        proposal,
        'ACT',
        shield.request.context,
      );
      expect(result.reason).not.toBe('ARCANA_PARAMETER_MISMATCH');
      expect(result.category).toBe(
        ['move-object', 'wind-shaping'].includes(tool.arcanum)
          ? 'ADJUDICATE'
          : 'MECHANIC',
      );
    }
  });

  for (const scenario of cases.language)
    it(`preserves ${scenario.id} with memory grounding and no newly prepared check`, () => {
      const proposal = freeActionSchema.parse({
        ...memory.offlineProposal,
        intent: scenario.intent,
        expression: scenario.expression,
        tool: scenario.tool,
        evidence:
          scenario.tool.type === 'QUERY' ? memory.expected.evidence : [],
      });
      const result = interpretFreeAction(
        proposal,
        'ACT',
        memory.request.context,
      );
      expect(result.category).toBe(scenario.category);
      expect(result.command).toBeUndefined();
      expect(result.optionId).toBeUndefined();
      if (result.category === 'QUERY')
        expect(result.text).toBe(
          memory.request.context.selection.information.find(
            (s: { scope: string }) => s.scope === 'KNOWN',
          ).text,
        );
    });

  it('keeps the historical DIRECT error visible and does not repair it to QUESTION', () => {
    const row = read('docs/ai/phase-5.6.1-case561-01-schema-confirmation.json')
      .rows[0];
    const raw = JSON.parse(row.rawResponse);
    expect(freeActionSchema.parse(raw).expression).toBe('DIRECT');
    expect(
      interpretFreeAction(
        freeActionSchema.parse(raw),
        'ACT',
        memory.request.context,
      ).category,
    ).toBe('QUERY');
    expect(row.expected.expression).toBe('QUESTION');
  });

  it('has matching Python/Zod wire shapes, field instructions and explicit NestJS rejection', () => {
    const tools = [
      ...cases.validTools,
      {
        type: 'ARCANA',
        arcanum: 'psychic-shield',
        raised: true,
        tradition: 'PSYCHIC',
      },
    ];
    const proposals = tools.map((tool) => ({
      ...shield.offlineProposal,
      tool,
    }));
    const child = spawnSync(
      resolve(root, 'apps/ai-service/.venv/bin/python'),
      [
        '-c',
        `import json,sys
from app.narrative.schemas import SelectedFreeAction
data=json.load(sys.stdin)
print(json.dumps({'proposals':[SelectedFreeAction.model_validate(p).model_dump(mode='json') for p in data], 'schema':SelectedFreeAction.model_json_schema()}))`,
      ],
      {
        cwd: resolve(root, 'apps/ai-service'),
        input: JSON.stringify(proposals),
        encoding: 'utf8',
        timeout: 15000,
      },
    );
    expect(child.status).toBe(0);
    const python = JSON.parse(child.stdout);
    const zodSchema: {
      properties: {
        expression: { description: string };
        tool: {
          oneOf: {
            properties: Record<
              string,
              { description?: string; const?: string }
            >;
          }[];
        };
      };
    } = JSON.parse(
      JSON.stringify(z.toJSONSchema(freeActionSchema, { io: 'input' })),
    );
    expect(zodSchema.properties.expression.description).toBe(
      python.schema.properties.expression.description,
    );
    const zodTools = zodSchema.properties.tool.oneOf;
    const zodArcana = zodTools.find(
      (tool) => tool.properties.type!.const === 'ARCANA',
    )!;
    for (const field of ['raised', 'tradition', 'use', 'fatigue', 'category'])
      expect(zodArcana.properties![field]!.description).toBe(
        python.schema.$defs.ArcanaTool.properties[field].description,
      );
    python.proposals.forEach((proposal: object, i: number) =>
      expect(freeActionSchema.parse(proposal)).toEqual(
        freeActionSchema.parse(proposals[i]),
      ),
    );
    const invalid = python.proposals.at(-1);
    expect(invalid.tool.tradition).toBe('PSYCHIC');
    expect(
      interpretFreeAction(
        freeActionSchema.parse(invalid),
        'ACT',
        shield.request.context,
      ).reason,
    ).toBe('ARCANA_PARAMETER_MISMATCH');
  });
});
