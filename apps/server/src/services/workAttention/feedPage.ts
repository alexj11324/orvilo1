import type {
  ActionSourceKind,
  NotificationFeedCard,
  NotificationFeedKind,
  NotificationFeedPage,
  NotificationPresentationFilter,
} from '@orvilo/types';

import type { NotificationItem } from '@/database/schemas/notification';

import type { PendingSourceCard } from './actionSources';
import { mapFeedWithLiveActions, overlayLiveTitles } from './feedCard';

const liveTitle = (task: { instruction?: string | null; name?: string | null }) => {
  const name = task.name?.trim();
  if (name) return name;
  return task.instruction?.trim() || null;
};

export interface InboxFeedDeps {
  actionSources: {
    listPendingForActorSettled: () => Promise<{
      pending: PendingSourceCard[];
      unavailable: ActionSourceKind[];
    }>;
  };
  input?: {
    cursor?: string;
    filter?: NotificationPresentationFilter;
    kind?: NotificationFeedKind;
    limit?: number;
  };
  notificationModel: {
    ensureActionCards: (pending: PendingSourceCard[]) => Promise<unknown>;
    listFeed: (input: InboxFeedDeps['input']) => Promise<NotificationItem[]>;
  };
  projectModel: {
    findByIds: (ids: string[]) => Promise<Array<{ id: string; name: string }>>;
  };
  taskModel: {
    findByIds: (
      ids: string[],
    ) => Promise<Array<{ id: string; instruction?: string | null; name?: string | null }>>;
  };
}

const uniqueIds = (cards: NotificationFeedCard[], resourceType: string) => [
  ...new Set(
    cards.flatMap((card) =>
      card.resourceType === resourceType && card.resourceId ? [card.resourceId] : [],
    ),
  ),
];

export const collectLiveTitles = async (
  cards: NotificationFeedCard[],
  taskModel: InboxFeedDeps['taskModel'],
  projectModel: InboxFeedDeps['projectModel'],
): Promise<Map<string, string>> => {
  const taskIds = uniqueIds(cards, 'task');
  const projectIds = uniqueIds(cards, 'project');
  const titles = new Map<string, string>();
  const [tasks, projects] = await Promise.all([
    taskIds.length > 0 ? taskModel.findByIds(taskIds) : [],
    projectIds.length > 0 ? projectModel.findByIds(projectIds) : [],
  ]);
  for (const task of tasks) {
    const title = liveTitle(task);
    if (title) titles.set(`task:${task.id}`, title);
  }
  for (const project of projects) {
    if (project.name) titles.set(`project:${project.id}`, project.name);
  }
  return titles;
};

/**
 * Inbox page payload. A down live source is `partial`, never an empty success.
 */
export const buildInboxFeed = async (deps: InboxFeedDeps): Promise<NotificationFeedPage> => {
  const { pending, unavailable } = await deps.actionSources.listPendingForActorSettled();
  await deps.notificationModel.ensureActionCards(pending);
  const rows = await deps.notificationModel.listFeed(deps.input);
  const cards = mapFeedWithLiveActions(rows, pending);
  let titles = new Map<string, string>();
  try {
    titles = await collectLiveTitles(cards, deps.taskModel, deps.projectModel);
  } catch (error) {
    console.error('[buildInboxFeed] live titles unavailable', error);
  }
  return {
    cards: overlayLiveTitles(cards, titles),
    lastReconciledAt: new Date().toISOString(),
    partial: unavailable.length > 0,
    sourceUnavailable: unavailable,
  };
};
