import { ConflictException } from '@nestjs/common';
import { transitionSession } from '../src/sessions/session-state';

const session = {
  status: 'AVAILABLE' as const,
  activeDurationSeconds: 0,
  startedAt: null,
  resumedAt: null,
  pausedAt: null,
  completedAt: null,
  endingType: null,
};
const at = (seconds: number) => new Date(seconds * 1000);

describe('session lifecycle', () => {
  it('counts only running intervals, including completion while paused', () => {
    const started = {
      ...session,
      ...transitionSession(session, 'start', at(10)),
    };
    expect(started.startedAt).toEqual(at(10));
    const paused = {
      ...started,
      ...transitionSession(started, 'pause', at(70)),
    };
    expect(paused.activeDurationSeconds).toBe(60);
    expect(paused.resumedAt).toBeNull();
    const resumed = {
      ...paused,
      ...transitionSession(paused, 'resume', at(700)),
    };
    const completed = transitionSession(
      resumed,
      'complete',
      at(730),
      'PLAYER_REQUESTED',
    );
    expect(completed.activeDurationSeconds).toBe(90);
    expect(completed.completedAt).toEqual(at(730));
    expect(
      transitionSession(paused, 'complete', at(900), 'NARRATIVE_PAUSE')
        .activeDurationSeconds,
    ).toBe(60);
  });
  it.each([
    'LOCKED',
    'AVAILABLE',
    'IN_PROGRESS',
    'PAUSED',
    'COMPLETED',
  ] as const)('rejects incompatible transitions from %s', (status) => {
    const allowed = {
      start: ['AVAILABLE'],
      pause: ['IN_PROGRESS'],
      resume: ['PAUSED'],
      complete: ['IN_PROGRESS', 'PAUSED'],
    };
    for (const action of ['start', 'pause', 'resume', 'complete'] as const) {
      if (!allowed[action].includes(status)) {
        expect(() =>
          transitionSession(
            { ...session, status },
            action,
            at(10),
            'PLAYER_REQUESTED',
          ),
        ).toThrow(ConflictException);
      }
    }
  });
  it('requires an ending type', () => {
    expect(() =>
      transitionSession({ ...session, status: 'PAUSED' }, 'complete', at(1)),
    ).toThrow(ConflictException);
  });
  it('does not auto-complete after the estimate and prevents negative clock deltas', () => {
    const running = {
      ...session,
      status: 'IN_PROGRESS' as const,
      resumedAt: at(100),
    };
    expect(
      transitionSession(running, 'pause', at(20000)).activeDurationSeconds,
    ).toBe(19900);
    expect(
      transitionSession(running, 'pause', at(90)).activeDurationSeconds,
    ).toBe(0);
  });
});
