import { ConflictException } from '@nestjs/common';
import type { SessionRecord } from '../database/schema';

export type SessionAction = 'start' | 'pause' | 'resume' | 'complete';
type State = Pick<
  SessionRecord,
  'status' | 'activeDurationSeconds' | 'resumedAt'
>;
export function activeSeconds(session: State, now: Date): number {
  return (
    session.activeDurationSeconds +
    (session.status === 'IN_PROGRESS' && session.resumedAt
      ? Math.max(
          0,
          Math.floor((now.getTime() - session.resumedAt.getTime()) / 1000),
        )
      : 0)
  );
}
export function transitionSession(
  session: State,
  action: SessionAction,
  now: Date,
  endingType?: NonNullable<SessionRecord['endingType']>,
): Partial<SessionRecord> {
  const allowed = {
    start: ['AVAILABLE'],
    pause: ['IN_PROGRESS'],
    resume: ['PAUSED'],
    complete: ['IN_PROGRESS', 'PAUSED'],
  };
  if (!allowed[action].includes(session.status))
    throw new ConflictException(`Cannot ${action} a ${session.status} session`);
  switch (action) {
    case 'start':
      return {
        status: 'IN_PROGRESS',
        startedAt: now,
        resumedAt: now,
        updatedAt: now,
      };
    case 'pause':
      return {
        status: 'PAUSED',
        activeDurationSeconds: activeSeconds(session, now),
        pausedAt: now,
        resumedAt: null,
        updatedAt: now,
      };
    case 'resume':
      return {
        status: 'IN_PROGRESS',
        resumedAt: now,
        pausedAt: null,
        updatedAt: now,
      };
    case 'complete':
      if (!endingType)
        throw new ConflictException('An ending type is required');
      return {
        status: 'COMPLETED',
        activeDurationSeconds: activeSeconds(session, now),
        completedAt: now,
        resumedAt: null,
        endingType,
        updatedAt: now,
      };
  }
}
