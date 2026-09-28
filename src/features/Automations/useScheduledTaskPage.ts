import { useTaskStore } from '@/store/task';

import type { AutomationScope, AutomationStatusFilter } from './shared';
import { automationStatusesFor, SCHEDULED_TASKS_PAGE_SIZE } from './shared';

export interface ScheduledTaskPageParams {
  /** Narrow the roll-up to one agent's automations. Absent = every agent. */
  agentId?: string;
  /** `false` keeps the hook mounted but idle — for surfaces that appear and disappear. */
  enabled?: boolean;
  /** 1-based page, matching the `Pagination` control both surfaces render. */
  page: number;
  projectId?: string;
  scope: AutomationScope;
  statusFilter: AutomationStatusFilter;
}

/**
 * The single read behind every scheduled-task surface.
 *
 * The Tasks page's automations tab and the Automations page are two doors into
 * one list, so they must not each own a fetch: two handles over the same rows
 * would page twice, refetch independently, and drift apart on a batch mutation.
 * Funnelling both through this hook — one page size, one arg shape — means SWR
 * sees identical keys and serves one cache entry to both.
 *
 * The caller keeps its own SWR result (`data` / `error` / `mutate`), because
 * the Tasks page shares its pagination and error plumbing with the "My tasks"
 * collection and needs the active handle directly.
 */
export const useScheduledTaskPage = ({
  agentId,
  enabled = true,
  page,
  projectId,
  scope,
  statusFilter,
}: ScheduledTaskPageParams) => {
  const useFetchScheduledTaskList = useTaskStore((s) => s.useFetchScheduledTaskList);

  return useFetchScheduledTaskList({
    agentId,
    enabled,
    limit: SCHEDULED_TASKS_PAGE_SIZE,
    offset: (page - 1) * SCHEDULED_TASKS_PAGE_SIZE,
    projectId,
    scope,
    statuses: automationStatusesFor(statusFilter),
  });
};
