import type { TaskItem } from '@orvilo/types';

export interface InterruptedTaskGeneration {
  currentTopicId: string | null;
  id: string;
  operationId: string | null;
  reservationId: string | null;
  topicId: string;
}

/**
 * Build a compensation fence from the operation/topic that was actually stopped.
 *
 * A task can have more than one historical/running topic, so task.currentTopicId
 * alone is not enough to decide which stopped operation owns the task-level run
 * reservation. Only the current topic is allowed to clear that reservation and
 * park the task; non-current topics are still canceled by TaskModel recovery but
 * cannot rewrite task-level state.
 */
export const buildInterruptedTaskGeneration = (
  task: Pick<TaskItem, 'currentTopicId' | 'id' | 'runReservationId'>,
  topic: { operationId?: string | null; topicId?: string | null },
): InterruptedTaskGeneration | null => {
  if (!topic.topicId) return null;
  const ownsCurrentGeneration = task.currentTopicId === topic.topicId;
  return {
    currentTopicId: ownsCurrentGeneration ? topic.topicId : null,
    id: task.id,
    operationId: topic.operationId ?? null,
    reservationId: ownsCurrentGeneration ? (task.runReservationId ?? null) : null,
    topicId: topic.topicId,
  };
};
