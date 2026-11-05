import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRendering } from '../apps/api/dist/narrative/rendering.js';
import { interpretFreeAction } from '../apps/api/dist/narrative/free-action.js';
import { freeActionSchema } from '../packages/shared-contracts/dist/index.js';
const directory = fileURLToPath(new URL('../docs/ai/', import.meta.url));
const files = fs
  .readdirSync(directory)
  .filter((f) => /^phase-5\.4-live-(?!summary).*\.json$/.test(f));
const cases = files.map((file) => {
  const report = JSON.parse(
    fs.readFileSync(path.join(directory, file), 'utf8'),
  );
  const validation =
    report.draft && report.confirmed && report.renderingContext
      ? validateRendering(
          report.draft,
          report.confirmed,
          report.renderingContext,
        )
      : null;
  const parsed = freeActionSchema.safeParse(report.proposal);
  const planning =
    parsed.success && report.request
      ? interpretFreeAction(
          parsed.data,
          report.request.interactionMode,
          report.request.context,
        )
      : null;
  return {
    file,
    case: report.case,
    requests: report.requests,
    interpretationPassed: report.interpretationPassed ?? null,
    interpretationSkipped: report.interpretationSkipped ?? false,
    error: report.error ?? null,
    rendererAccepted: validation?.accepted ?? null,
    rendererReason: validation?.reason ?? null,
    resolution: planning,
    usage: report.usage,
  };
});
const usage = cases.flatMap((c) => c.usage);
const report = {
  date: '2026-11-01',
  authorizationCeiling: 11,
  actualRequests: usage.length,
  unusedRequests: 11 - usage.length,
  inputTokensReported: usage.reduce((n, u) => n + u.inputTokens, 0),
  outputTokensReported: usage.reduce((n, u) => n + u.outputTokens, 0),
  totalTokensReported: usage.reduce((n, u) => n + (u.totalTokens ?? 0), 0),
  requestsWithoutReportedUsage: usage.filter((u) => !u.usageReported).length,
  totalDurationMs: usage.reduce((n, u) => n + u.durationMs, 0),
  campaignWrites: false,
  mechanicalOutcomes: 'SYNTHETIC_FIXTURE',
  review: 'AGENT_TECHNICAL_REVIEW; HUMAN_REVIEW_PENDING',
  cases,
};
fs.writeFileSync(
  path.join(directory, 'phase-5.4-live-summary.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify({ ...report, cases: cases.map((c) => c.file) }, null, 2),
);
