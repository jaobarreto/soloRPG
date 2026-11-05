// Pure replay of the original PROPOSE JSON; never loads Nest's application or a DB.
import { readFileSync } from 'node:fs';
import { freeActionSchema } from '../packages/shared-contracts/dist/index.js';
import { interpretFreeAction } from '../apps/api/dist/narrative/free-action.js';

const { rawText, request } = JSON.parse(readFileSync(0, 'utf8'));
if (request.stage !== 'PROPOSE') throw new Error('PROPOSE_ONLY');
let raw;
try {
  raw = JSON.parse(rawText);
} catch {
  raw = undefined;
}
const parsed = freeActionSchema.safeParse(raw);
const zod = {
  valid: parsed.success,
  errors: parsed.success ? [] : parsed.error.issues.map(({ code }) => code),
};
const resolution = parsed.success
  ? interpretFreeAction(
      parsed.data,
      request.interactionMode,
      request.context,
      request.context.mentions ?? [],
    )
  : null;
const wouldAuthorizeEffect = Boolean(
  resolution &&
  (resolution.command ||
    resolution.combat ||
    resolution.optionId ||
    resolution.minutes ||
    resolution.category === 'MECHANIC'),
);
process.stdout.write(JSON.stringify({ zod, resolution, wouldAuthorizeEffect }));
