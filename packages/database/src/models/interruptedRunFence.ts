export interface InterruptedRunFenceInput {
  currentTopicId: string | null;
  reservationId: string | null;
  topicId: string;
}

export interface InterruptedRunTaskState {
  currentTopicId: string | null;
  runReservationId: string | null;
  status: string;
}

/** Pure form of the task-level compensation fence, kept testable outside PG. */
export const shouldParkInterruptedTask = (
  task: InterruptedRunTaskState,
  input: InterruptedRunFenceInput,
): boolean =>
  task.status === 'running' &&
  input.currentTopicId !== null &&
  input.currentTopicId === input.topicId &&
  task.currentTopicId === input.currentTopicId &&
  task.runReservationId === input.reservationId;
