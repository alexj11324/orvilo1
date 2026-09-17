import { describe, expect, it } from 'vitest';

import { shouldParkInterruptedTask } from './interruptedRunFence';

describe('shouldParkInterruptedTask', () => {
  it('requires a real current-topic fence', () => {
    expect(
      shouldParkInterruptedTask(
        { currentTopicId: 'topic-1', runReservationId: 'run-1', status: 'running' },
        { currentTopicId: null, reservationId: null, topicId: 'topic-old' },
      ),
    ).toBe(false);
  });

  it('accepts the exact current topic and reservation generation', () => {
    expect(
      shouldParkInterruptedTask(
        { currentTopicId: 'topic-1', runReservationId: 'run-1', status: 'running' },
        { currentTopicId: 'topic-1', reservationId: 'run-1', topicId: 'topic-1' },
      ),
    ).toBe(true);
  });

  it('rejects a successor reservation', () => {
    expect(
      shouldParkInterruptedTask(
        { currentTopicId: 'topic-1', runReservationId: 'run-2', status: 'running' },
        { currentTopicId: 'topic-1', reservationId: 'run-1', topicId: 'topic-1' },
      ),
    ).toBe(false);
  });
});
