import { WORK_QUERY_WORKFLOW_COLUMNS } from '@orvilo/types';

export const MY_WORK_BOARD_MODES = ['assigned', 'delegated'] as const;

export const isMyWorkBoardMode = (mode: string): boolean =>
  (MY_WORK_BOARD_MODES as readonly string[]).includes(mode);

export const WORK_QUERY_BOARD_MIME = 'application/x-orvilo-work-query-task';

export interface WorkQueryBoardTask {
  domainRevision: number;
  id: string;
  identifier: string;
  name?: string | null;
  status?: string | null;
  teamId?: string | null;
  workflowCategory?: string | null;
  workflowStateId?: string | null;
}

export interface WorkQueryBoardPayload {
  groupKey: string;
  task: WorkQueryBoardTask;
}

export type WorkQueryMovePlan =
  | { type: 'noop' }
  | {
      expectedDomainRevision: number;
      groupBy: 'status' | 'workflowCategory';
      targetKey: string;
      type: 'local';
    }
  | { status: 'canceled' | 'completed'; task: WorkQueryBoardTask; type: 'cascade' };

export const parseWorkQueryBoardPayload = (raw: string): WorkQueryBoardPayload | null => {
  try {
    const parsed = JSON.parse(raw) as WorkQueryBoardPayload;
    if (!parsed?.groupKey || !parsed.task?.id || !parsed.task.identifier) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const cascadeStatusForBoardKey = (
  groupBy: 'status' | 'workflowCategory',
  key: string,
): 'canceled' | 'completed' | null => {
  if (groupBy === 'workflowCategory') {
    if (key === 'done') return 'completed';
    if (key === 'canceled') return 'canceled';
    return null;
  }
  if (key === 'completed' || key === 'canceled') return key;
  return null;
};

export const taskBoardGroupKey = (
  task: WorkQueryBoardTask,
  groupBy: 'status' | 'workflowCategory',
) => (groupBy === 'status' ? (task.status ?? 'backlog') : (task.workflowCategory ?? 'backlog'));

export const workQueryMovePlan = (input: {
  groupBy: 'status' | 'workflowCategory';
  targetKey: string;
  task: WorkQueryBoardTask;
}): WorkQueryMovePlan => {
  if (taskBoardGroupKey(input.task, input.groupBy) === input.targetKey) {
    return { type: 'noop' };
  }
  if (
    input.groupBy === 'workflowCategory' &&
    !(WORK_QUERY_WORKFLOW_COLUMNS as readonly string[]).includes(input.targetKey)
  ) {
    return { type: 'noop' };
  }
  const cascade = cascadeStatusForBoardKey(input.groupBy, input.targetKey);
  if (cascade && !input.task.workflowStateId) {
    return { status: cascade, task: input.task, type: 'cascade' };
  }
  return {
    expectedDomainRevision: input.task.domainRevision,
    groupBy: input.groupBy,
    targetKey: input.targetKey,
    type: 'local',
  };
};

export const workQueryColumnLabelKey = (
  groupBy: 'status' | 'workflowCategory',
  key: string,
): string =>
  groupBy === 'workflowCategory'
    ? `taskDetail.workflow.category.${key}`
    : `taskDetail.status.${key}`;
