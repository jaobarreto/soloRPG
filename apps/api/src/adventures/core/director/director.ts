import { and, eq, inArray } from 'drizzle-orm';
import { gameEvents } from '../../../database/game-schema';
import { narrativeActions } from '../../../database/narrative-schema';
import { campaignSessions } from '../../../database/schema';
import { stepId } from '../../../narrative/identifiers';
import type { Reader, loadAdventure } from '../state/state';
import { adventureEntityId } from '../state/identity';
import { evaluateUnit, type ProgressEvidence } from './progression';

// Internal projection. Callers must explicitly select public fields.
export async function directorState(
  loaded: NonNullable<Awaited<ReturnType<typeof loadAdventure>>>,
  sessionId: string,
  tx: Reader,
) {
  const progression = loaded.definition.progression;
  if (!progression) return null;
  const campaignId = loaded.instance.campaignId;
  const sessions = await tx
    .select()
    .from(campaignSessions)
    .where(eq(campaignSessions.campaignId, campaignId));
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return null;
  const events = await tx
    .select()
    .from(gameEvents)
    .where(eq(gameEvents.campaignId, campaignId))
    .orderBy(gameEvents.sequence);
  const receipts = await tx
    .select()
    .from(narrativeActions)
    .where(
      and(
        eq(narrativeActions.campaignId, campaignId),
        inArray(narrativeActions.status, ['COMMITTED', 'COMPLETED']),
      ),
    );
  const unitIndex = session.sessionNumber - 1;
  const operational = loaded.planning?.sessions[unitIndex]?.operational;
  const unit = loaded.planning
    ? operational?.unit
    : progression.units[unitIndex];
  if (!unit) return null;
  // Scope all proof to its narrative unit. Prior-unit facts may satisfy explicit dependencies.
  const evidence: ProgressEvidence[] = [];
  for (const event of events) {
    const origin = sessions.find((s) => s.id === event.sessionId);
    if (!origin) continue;
    evidence.push({
      id: event.id,
      sequence: event.sequence,
      eventType: event.type,
      changes: event.changes,
    });
    if (
      event.type === 'NARRATIVE_FACT_CONFIRMED' &&
      typeof event.changes?.factKey === 'string' &&
      event.changes.definitionId === loaded.instance.definitionId &&
      (!operational?.localFacts.some(
        (fact) => fact.key === event.changes?.factKey,
      ) ||
        event.changes.planningRevision === loaded.planning?.revision)
    )
      evidence.push({
        id: event.id,
        sequence: event.sequence,
        fact: event.changes.factKey,
      });
    for (const receipt of receipts.filter(
      (r) =>
        r.sessionId === event.sessionId &&
        r.confirmed?.eventIds.includes(event.id) &&
        event.type === 'CONSEQUENCE_RECORDED' &&
        event.commandId === stepId(r.id, 'scene-result'),
    )) {
      for (const scene of loaded.definition.scenes)
        for (const option of scene.options)
          if (
            receipt.optionId ===
            adventureEntityId(
              campaignId,
              `option-${scene.key}-${option.key}`,
              loaded.instance.entityNamespace,
            )
          )
            evidence.push({
              id: event.id,
              sequence: event.sequence,
              sceneKey: scene.key,
              optionKey: option.key,
              success: receipt.success ?? false,
            });
    }
  }
  const evidenceFor = (number: number) =>
    evidence.filter((e) => {
      const event = events.find((event) => event.id === e.id);
      return sessions.some(
        (s) => s.id === event?.sessionId && s.sessionNumber <= number,
      );
    });
  const scopedEvidence = evidenceFor(session.sessionNumber);
  const evaluated = evaluateUnit(
    unit,
    scopedEvidence,
    session.status === 'COMPLETED',
  );
  const visible =
    session.status === 'LOCKED' || !session.startedAt
      ? []
      : evaluated.objectives.filter(
          (o) =>
            o.publicDescription &&
            !['LOCKED', 'UNAVAILABLE'].includes(o.status),
        );
  const publicObjectives = visible.map((o) => ({
    id: adventureEntityId(
      campaignId,
      `objective-${unit.key}-${o.key}`,
      loaded.instance.entityNamespace,
    ),
    description: o.publicDescription!,
    completed: o.status === 'RESOLVED',
    weight: o.weight,
    evidenceEventIds: o.evidenceEventIds.filter((id) =>
      events.some((e) => e.id === id && e.visibility !== 'GM_ONLY'),
    ),
  }));
  // Public coarse projection only counts known public goals; no hidden denominator or names.
  const done = publicObjectives.filter((o) => o.completed).length;
  const legacyProgress =
    !session.startedAt || session.status === 'LOCKED'
      ? 0
      : session.status === 'COMPLETED'
        ? 100
        : evaluated.eligible
          ? 90
          : publicObjectives.length && done
            ? 50
            : 0;
  const closed = session.status === 'COMPLETED';
  const weightedPoints =
    operational &&
    visible
      .filter((goal) => goal.status === 'RESOLVED')
      .reduce((sum, goal) => sum + (operational.points[goal.key] ?? 0), 0);
  const publicProgress = operational
    ? (weightedPoints ?? 0) +
      (closed && evaluated.eligible && !evaluated.terminal
        ? operational.closingPoints
        : 0)
    : legacyProgress;
  const terminalClosed = sessions.some((s) => {
    const u = progression.units[s.sessionNumber - 1];
    return (
      s.status === 'COMPLETED' &&
      u &&
      evaluateUnit(u, evidenceFor(s.sessionNumber), true).terminal
    );
  });
  const total = progression.units.reduce((sum, u) => sum + u.weight, 0);
  const closedWeight = progression.units.reduce(
    (sum, u, i) =>
      sum +
      (sessions.some(
        (s) => s.sessionNumber === i + 1 && s.status === 'COMPLETED',
      )
        ? u.weight
        : 0),
    0,
  );
  return {
    ...evaluated,
    unit,
    evidence: scopedEvidence,
    campaignProgress: loaded.planning
      ? Math.floor(publicProgress / loaded.planning.sessions.length)
      : terminalClosed
        ? 100
        : Math.min(
            99,
            Math.floor(
              (progression.units.reduce((sum, u, i) => {
                const s = sessions.find((s) => s.sessionNumber === i + 1);
                return (
                  sum +
                  (s?.startedAt
                    ? (u.weight *
                        evaluateUnit(
                          u,
                          evidenceFor(i + 1),
                          s.status === 'COMPLETED',
                        ).progress) /
                      100
                    : 0)
                );
              }, 0) *
                100) /
                total,
            ),
          ),
    public: {
      objectives: publicObjectives,
      progress: publicProgress,
      ...(closed && operational
        ? {
            outcome: evaluated.terminal
              ? ('WITHDRAWN' as const)
              : ('COMPLETED' as const),
          }
        : {}),
      campaignProgress: loaded.planning
        ? Math.floor(publicProgress / loaded.planning.sessions.length)
        : terminalClosed
          ? 100
          : Math.min(99, Math.floor((closedWeight * 100) / total)),
      objectiveCompleted:
        !!session.startedAt &&
        session.status !== 'LOCKED' &&
        evaluated.eligible,
      suggestSessionEnding:
        !!session.startedAt &&
        session.status !== 'LOCKED' &&
        evaluated.eligible,
      progressionMode: 'OBJECTIVES' as const,
    },
  };
}
