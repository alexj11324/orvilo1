import { describe, expect, it } from 'vitest';

import { buildInterruptedTaskGeneration } from './interruptedGeneration';

describe('buildInterruptedTaskGeneration', () => {
  const task = {
    currentTopicId: 'topic-current',
    id: 'task-1',
    runReservationId: 'run-current',
  } as any;

  it('lets the current topic own the task-level reservation fence', () => {
    expect(
      buildInterruptedTaskGeneration(task, { operationId: 'op-current', topicId: 'topic-current' }),
    ).toEqual({
      currentTopicId: 'topic-current',
      id: 'task-1',
      operationId: 'op-current',
      reservationId: 'run-current',
      topicId: 'topic-current',
    });
  });

  it('does not attach the current reservation to a different stopped topic', () => {
    expect(
      buildInterruptedTaskGeneration(task, { operationId: 'op-old', topicId: 'topic-old' }),
    ).toEqual({
      currentTopicId: null,
      id: 'task-1',
      operationId: 'op-old',
      reservationId: null,
      topicId: 'topic-old',
    });
  });

  it('ignores topic rows without a topic id', () => {
    expect(buildInterruptedTaskGeneration(task, { operationId: 'op-missing' })).toBeNull();
  });
});
