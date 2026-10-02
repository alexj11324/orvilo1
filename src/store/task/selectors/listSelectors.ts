import type { TaskStoreState } from '../initialState';
import type { TaskGroupItem, TaskListItem } from '../slices/list/initialState';

const taskList = (s: TaskStoreState): TaskListItem[] => s.tasks;

const taskListTotal = (s: TaskStoreState) => s.tasksTotal;

const isTaskListInit = (s: TaskStoreState) => s.isTaskListInit;

const listVisibility = (s: TaskStoreState) => s.listVisibility;

/**
 * Legacy execution-status → human label for the one surface still rendering
 * raw `tasks.status` (`TaskStatusIcon`); Issue Status labels come from the
 * workflow category elsewhere. This is the execution projection, not the
 * Issue board's columns.
 */
const statusDisplayMap: Record<string, string> = {
  backlog: 'Backlog',
  canceled: 'Canceled',
  completed: 'Done',
  failed: 'Failed',
  paused: 'Needs input',
  running: 'In progress',
  scheduled: 'Scheduled',
};

const getDisplayStatus = (status: string): string => statusDisplayMap[status] ?? status;

// ── Kanban selectors (read from taskGroups, populated by groupList API) ──

const taskGroups = (s: TaskStoreState): TaskGroupItem[] => s.taskGroups;

const isTaskGroupListInit = (s: TaskStoreState) => s.isTaskGroupListInit;

const taskGroupByKey = (key: string) => (s: TaskStoreState) =>
  s.taskGroups.find((g) => g.key === key);

const backlogTasks = (s: TaskStoreState) => taskGroupByKey('backlog')(s)?.tasks ?? [];

const runningTasks = (s: TaskStoreState) => taskGroupByKey('in_progress')(s)?.tasks ?? [];

const needsInputTasks = (s: TaskStoreState) => taskGroupByKey('in_review')(s)?.tasks ?? [];

const doneTasks = (s: TaskStoreState) => taskGroupByKey('done')(s)?.tasks ?? [];

const isListEmpty = (s: TaskStoreState) => s.isTaskListInit && s.tasks.length === 0;

export const taskListSelectors = {
  backlogTasks,
  doneTasks,
  getDisplayStatus,
  isListEmpty,
  isTaskGroupListInit,
  isTaskListInit,
  listVisibility,
  needsInputTasks,
  runningTasks,
  taskGroupByKey,
  taskGroups,
  taskList,
  taskListTotal,
};
