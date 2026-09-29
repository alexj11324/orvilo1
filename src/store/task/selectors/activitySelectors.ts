import type { TaskDetailActivity } from '@orvilo/types';

import type { TaskStoreState } from '../initialState';
import { taskDetailSelectors } from './detailSelectors';

const taskActivities = (s: TaskStoreState, taskId?: string): TaskDetailActivity[] => {
  const detail = taskDetailSelectors.taskDetail(s, taskId);
  if (!detail?.activities) return [];

  return [...detail.activities].sort((a, b) => {
    const timeA = a.time ? new Date(a.time).getTime() : 0;
    const timeB = b.time ? new Date(b.time).getTime() : 0;
    return timeA - timeB;
  });
};

const activeTaskActivities = (s: TaskStoreState): TaskDetailActivity[] =>
  taskActivities(s, s.activeTaskId);

const taskBriefs = (s: TaskStoreState, taskId?: string): TaskDetailActivity[] =>
  taskActivities(s, taskId).filter((a) => a.type === 'brief');

const activeTaskBriefs = (s: TaskStoreState): TaskDetailActivity[] => taskBriefs(s, s.activeTaskId);

const taskTopics = (s: TaskStoreState, taskId?: string): TaskDetailActivity[] =>
  taskActivities(s, taskId).filter((a) => a.type === 'topic');

const activeTaskTopics = (s: TaskStoreState): TaskDetailActivity[] => taskTopics(s, s.activeTaskId);

/** The newest run of the given task — the one a result panel is about. */
const taskLatestTopic = (s: TaskStoreState, taskId?: string): TaskDetailActivity | undefined =>
  taskTopics(s, taskId).at(-1);

const activeTaskLatestTopic = (s: TaskStoreState): TaskDetailActivity | undefined =>
  taskLatestTopic(s, s.activeTaskId);

const taskComments = (s: TaskStoreState, taskId?: string): TaskDetailActivity[] =>
  taskActivities(s, taskId).filter((a) => a.type === 'comment');

const activeTaskComments = (s: TaskStoreState): TaskDetailActivity[] =>
  taskComments(s, s.activeTaskId);

const unresolvedBriefCountFor = (s: TaskStoreState, taskId?: string): number =>
  taskBriefs(s, taskId).filter((b) => !b.resolvedAction).length;

const unresolvedBriefCount = (s: TaskStoreState): number =>
  unresolvedBriefCountFor(s, s.activeTaskId);

const hasUnresolvedBriefs = (s: TaskStoreState): boolean => unresolvedBriefCount(s) > 0;

const hasUnresolvedBriefsFor = (s: TaskStoreState, taskId?: string): boolean =>
  unresolvedBriefCountFor(s, taskId) > 0;

const activeDrawerTopicActivity = (s: TaskStoreState): TaskDetailActivity | undefined => {
  const topicId = s.activeTopicDrawerTopicId;
  if (!topicId) return undefined;
  // A run opened off its task's detail surface (kanban board) carries the
  // owning task identifier — its activities live under that detail entry, not
  // whatever `activeTaskId` happens to point at.
  const detail = s.activeTopicDrawerTaskId
    ? s.taskDetailMap[s.activeTopicDrawerTaskId]
    : taskDetailSelectors.activeTaskDetail(s);
  const topics = (detail?.activities ?? []).filter((a) => a.type === 'topic');
  return topics.find((a) => a.id === topicId);
};

export const taskActivitySelectors = {
  activeDrawerTopicActivity,
  activeTaskActivities,
  activeTaskBriefs,
  activeTaskComments,
  activeTaskLatestTopic,
  activeTaskTopics,
  hasUnresolvedBriefs,
  hasUnresolvedBriefsFor,
  taskActivities,
  taskBriefs,
  taskComments,
  taskLatestTopic,
  taskTopics,
  unresolvedBriefCount,
  unresolvedBriefCountFor,
};
