import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { freeActionSchema } from '@solo-rpg/shared-contracts';

const root = resolve(__dirname, '../../..');
const matrix = JSON.parse(
  readFileSync(
    resolve(root, 'packages/shared-contracts/fixtures/phase56-semantic.json'),
    'utf8',
  ),
);
const plan = JSON.parse(
  readFileSync(resolve(root, 'docs/ai/phase-5.6.1-plan.json'), 'utf8'),
);
const receipt = JSON.parse(
  readFileSync(resolve(root, 'docs/ai/phase-5.6.1-live-result.json'), 'utf8'),
);

function pythonValidation(proposals: unknown[]) {
  const process = spawnSync(
    resolve(root, 'apps/ai-service/.venv/bin/python'),
    [
      '-c',
      `import json, sys
from pydantic import ValidationError
from app.narrative.schemas import SelectedFreeAction
rows = []
for proposal in json.load(sys.stdin):
    try:
        parsed = SelectedFreeAction.model_validate(proposal)
        rows.append({"valid": True, "proposal": parsed.model_dump(mode="json")})
    except ValidationError:
        rows.append({"valid": False})
print(json.dumps(rows))`,
    ],
    {
      cwd: resolve(root, 'apps/ai-service'),
      input: JSON.stringify(proposals),
      encoding: 'utf8',
      timeout: 15000,
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  expect(process.status).toBe(0);
  return JSON.parse(process.stdout) as {
    valid: boolean;
    proposal?: unknown;
  }[];
}

describe('Phase 5.6.1 strict Python/NestJS contract compatibility (offline)', () => {
  it('accepts the 101 matrix proposals and eight directed fixtures in both directions', () => {
    const proposals = [
      ...matrix.cases.map((c: { proposal: unknown }) => c.proposal),
      ...plan.cases.map((c: { offlineProposal: unknown }) => c.offlineProposal),
    ];
    expect(proposals).toHaveLength(109);
    const python = pythonValidation(proposals);
    const fromZod = proposals.map((proposal, index) => {
      expect(python[index]!.valid).toBe(true);
      expect(freeActionSchema.safeParse(python[index]!.proposal).success).toBe(
        true,
      );
      return freeActionSchema.parse(proposal);
    });
    expect(pythonValidation(fromZod).every((row) => row.valid)).toBe(true);
  });

  it('rejects the real kind=QUERY response and invalid discriminators/extra fields in both runtimes', () => {
    const base = plan.cases[0].offlineProposal;
    const invalid = [
      JSON.parse(receipt.rows[0].rawResponse),
      { ...base, kind: 'ADMIN' },
      { ...base, kind: null },
      { ...base, command: { type: 'RESOURCE_SET' } },
      { ...base, tool: { type: 'RESOURCE_SET' } },
      { ...base, tool: { type: 'QUERY', subject: 'SECRET' } },
      { ...base, tool: { type: 'QUERY', subject: 'MEMORY', difficulty: 10 } },
      { ...base, tool: { type: 'ARCANA', arcanum: 'invented' } },
      { ...base, description: 'x'.repeat(1001) },
    ];
    const python = pythonValidation(invalid);
    for (const [index, proposal] of invalid.entries()) {
      expect(python[index]!.valid).toBe(false);
      expect(freeActionSchema.safeParse(proposal).success).toBe(false);
    }
    expect(invalid[0].kind).toBe('QUERY');
  });
});
