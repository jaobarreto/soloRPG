// Pure production policy replay. No application startup, database, SDK or effects.
import { readFileSync } from 'node:fs';
import { freeActionSchema } from '../packages/shared-contracts/dist/index.js';
import { interpretFreeAction } from '../apps/api/dist/narrative/free-action.js';
import { validateRendering } from '../apps/api/dist/narrative/rendering.js';

const input = JSON.parse(readFileSync(0, 'utf8'));
const parsed = freeActionSchema.safeParse(input.proposal);
let report;
if (!parsed.success) {
  report = { schemaValid: false, authorization: 'NOT_EVALUABLE' };
} else {
  const resolution = interpretFreeAction(
    parsed.data,
    input.request.interactionMode,
    input.request.context,
  );
  const informational = ['QUERY', 'OBSERVE', 'OOC'].includes(
    resolution.category,
  );
  const confirmed = { narrative: resolution.text, eventIds: [] };
  const renderingContext = {
    category: resolution.category,
    protagonist: null,
    speaker: null,
    scene: null,
    facts: [],
    rules: [],
  };
  report = {
    schemaValid: true,
    resolution,
    // CLARIFY and ADJUDICATE are legitimate results, not automatic model errors.
    authorization: resolution.reason ? 'LIMITED_OR_REFUSED' : 'AUTHORIZED',
    effectsExecuted: false,
    campaignWrites: false,
    renderer: informational
      ? validateRendering(confirmed, confirmed, renderingContext)
      : null,
  };
}
process.stdout.write(JSON.stringify(report));
