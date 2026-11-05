// Read-only C.1 replay. Import only production contracts and pure policies, never
// an application module, database client or engine executor.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  freeActionSchema,
  narrationSchema,
} from '../packages/shared-contracts/dist/index.js';
import { interpretFreeAction } from '../apps/api/dist/narrative/free-action.js';
import {
  publicationChoices,
  validateRendering,
} from '../apps/api/dist/narrative/rendering.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const planPath = `${root}docs/ai/phase-5.6.3c-1-live-plan.json`;
const planDigest =
  '04c31b43e50bd39573e75529590f5c33128d806e426930858263b40a8b93d712';
const clone = (value) => JSON.parse(JSON.stringify(value));

export function evaluateCase(input) {
  const bytes = fs.readFileSync(planPath);
  if (createHash('sha256').update(bytes).digest('hex') !== planDigest)
    throw new Error('FROZEN_PLAN_DRIFT');
  const plan = JSON.parse(bytes);
  const entry = plan.cases.find((c) => c.caseId === input.caseId);
  if (!entry || !['PROPOSE', 'NARRATE'].includes(input.stage))
    throw new Error('UNKNOWN_CASE_OR_STAGE');
  let original;
  try {
    original = JSON.parse(input.rawText);
  } catch {
    return {
      zod: { valid: false, errors: ['INVALID_JSON'] },
      resolution: null,
      publication: null,
    };
  }
  const schema = input.stage === 'PROPOSE' ? freeActionSchema : narrationSchema;
  const parsed = schema.safeParse(original);
  const zod = {
    valid: parsed.success,
    errors: parsed.success ? [] : parsed.error.issues.map((e) => e.code),
  };
  if (!parsed.success) return { zod, resolution: null, publication: null };
  if (input.stage === 'PROPOSE') {
    const request = entry.proposeRequest;
    const resolution = interpretFreeAction(
      parsed.data,
      request.interactionMode,
      clone(request.context),
    );
    const wouldAuthorizeEffect = Boolean(
      resolution.command ||
      resolution.combat ||
      resolution.optionId ||
      resolution.minutes ||
      resolution.category === 'MECHANIC',
    );
    return {
      zod,
      resolution,
      wouldAuthorizeEffect,
      backendBlocked: ['CLARIFY', 'THINK', 'ADJUDICATE'].includes(
        resolution.category,
      ),
      publication: null,
    };
  }
  const request = entry.narrateRequest;
  const context = clone(request.context.rendering);
  const originalValidation = validateRendering(
    original,
    request.confirmed,
    context,
  );
  const graph = narrationSchema.safeParse(input.graphOutput);
  const publication = graph.success
    ? validateRendering(graph.data, request.confirmed, context)
    : null;
  return {
    zod,
    graphZod: { valid: graph.success },
    originalValidation,
    publication,
    graphChangedNarrative:
      graph.success && graph.data.narrative !== original.narrative,
    speakerId: context.speaker.id,
    facts: context.facts,
    reconstructedCatalog: publicationChoices(context, request.confirmed),
    attributionScope:
      'FROZEN_SPEAKER_ID_AND_OWN_FACTS_NO_DATABASE_OR_PRIVATE_OWNER_RECONSTRUCTION',
    campaignWrites: false,
  };
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  try {
    const input = JSON.parse(fs.readFileSync(0, 'utf8'));
    process.stdout.write(JSON.stringify(evaluateCase(input)) + '\n');
  } catch {
    process.stdout.write(
      JSON.stringify({ error: 'READ_ONLY_REPLAY_FAILED' }) + '\n',
    );
    process.exitCode = 1;
  }
}
