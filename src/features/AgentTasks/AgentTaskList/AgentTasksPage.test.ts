import { describe, expect, it } from 'vitest';

import type { TaskViewMode } from '@/store/global/initialState';
import type { TaskListItem } from '@/store/task/slices/list/initialState';

import {
  clampCollectionPage,
  getMyTaskViewOptions,
  getTaskCreateActionBehavior,
  getTaskPageHeaderVisibility,
  PAGINATED_COLLECTION_PINNED_OPTIONS,
  resolveMyTaskScope,
  resolveOrdinaryCollectionSurface,
  resolveTaskCollection,
  resolveTaskCollectionView,
} from './AgentTasksPage';
import {
  collapseSubTasks,
  compareTaskItems,
  DEFAULT_TASK_LIST_VIEW_OPTIONS,
} from './listViewOptions';
import { shouldRenderTaskAgentPanelToggle } from './taskAgentPanelToggle';

const taskUpdatedAt = (id: string, updatedAt: string): TaskListItem =>
  ({ id, identifier: id, status: 'backlog', updatedAt: new Date(updatedAt) }) as TaskListItem;

describe('AgentTasksPage', () => {
  describe('clampCollectionPage', () => {
    it('moves a stale last page back into range when the result total shrinks', () => {
      expect(clampCollectionPage(2, 50, 50)).toBe(1);
      expect(clampCollectionPage(3, 51, 50)).toBe(2);
    });

    it('keeps the first page valid for an empty result', () => {
      expect(clampCollectionPage(1, 0, 50)).toBe(1);
    });

    it('clamps against the page size the collection actually pages by', () => {
      // The bug this guards: the automations tab pages 25 at a time, so with 40
      // automations page 2 exists. Clamping with "My tasks"' size of 50 would
      // compute one page and snap the user straight back to page 1.
      expect(clampCollectionPage(2, 40, 25)).toBe(2);
      expect(clampCollectionPage(3, 40, 25)).toBe(2);
      expect(clampCollectionPage(3, 40, 50)).toBe(1);
    });
  });

  describe('getMyTaskViewOptions', () => {
    it('pins ordering to the updatedAt-desc server page, renders every fetched row, keeps the rest', () => {
      expect(
        getMyTaskViewOptions({
          ...DEFAULT_TASK_LIST_VIEW_OPTIONS,
          groupBy: 'priority',
          hideCompleted: false,
          orderBy: 'title',
          orderDirection: 'asc',
          showSubTasks: false,
        }),
      ).toEqual({
        ...DEFAULT_TASK_LIST_VIEW_OPTIONS,
        groupBy: 'priority',
        hideCompleted: false,
        orderBy: 'updatedAt',
        orderDirection: 'asc',
        showSubTasks: true,
      });
    });

    it('never folds a fetched sub-task away, so a page is never sparser than the server sent it', () => {
      const options = getMyTaskViewOptions({
        ...DEFAULT_TASK_LIST_VIEW_OPTIONS,
        showSubTasks: false,
      });
      const parent = { ...taskUpdatedAt('p', '2026-02-01'), parentTaskId: null };
      const child = { ...taskUpdatedAt('c', '2026-02-02'), parentTaskId: 'p' };
      // `collapseSubTasks` is what `TaskList` applies when sub-tasks are hidden;
      // pinning `showSubTasks` keeps it out of the paginated path.
      expect(options.showSubTasks).toBe(true);
      expect(collapseSubTasks([parent, child]).map((t) => t.id)).toEqual(['p']);
    });

    it('renders a page newest-first, like the server paginates it', () => {
      const options = getMyTaskViewOptions(DEFAULT_TASK_LIST_VIEW_OPTIONS);
      const newer = taskUpdatedAt('a', '2026-02-01');
      const older = taskUpdatedAt('b', '2026-01-01');
      expect(compareTaskItems(newer, older, options)).toBeLessThan(0);
    });
  });

  describe('resolveTaskCollectionView', () => {
    it('renders the board in every collection that offers the switch', () => {
      // The reported bug: "My tasks" showed the list/board switch but rendered
      // its list unconditionally, so picking Board changed nothing.
      expect(resolveTaskCollectionView('mine', 'kanban')).toBe('board');
      expect(resolveTaskCollectionView('tasks', 'kanban')).toBe('board');
    });

    it('renders the list whenever the list mode is selected', () => {
      expect(resolveTaskCollectionView('mine', 'list')).toBe('list');
      expect(resolveTaskCollectionView('tasks', 'list')).toBe('list');
    });

    it('keeps the scheduled roll-up a list — it is offered no switch', () => {
      expect(resolveTaskCollectionView('scheduled', 'kanban')).toBe('list');
      expect(resolveTaskCollectionView('scheduled', 'list')).toBe('list');
    });
  });

  describe('resolveOrdinaryCollectionSurface', () => {
    it('follows the stored view mode regardless of how many tasks exist', () => {
      // The empty-board fallback snapped a list-mode user onto the board at 0
      // tasks and back onto the list at 1 — the surface must not move with the
      // count. Empty list mode renders the list's own empty state.
      expect(resolveOrdinaryCollectionSurface('list')).toBe('list');
      expect(resolveOrdinaryCollectionSurface('kanban')).toBe('board');
    });

    it('keeps an empty list-mode collection on the list — the count must not vote', () => {
      // The pre-fix signature took `isListEmpty` and forced the board whenever
      // the collection was empty. Calling through the legacy two-argument
      // shape proves the empty condition is no longer read at all — this case
      // returns 'board' on the parent implementation and fails there.
      const legacyCall = resolveOrdinaryCollectionSurface as (
        viewMode: TaskViewMode,
        isListEmpty?: boolean,
      ) => 'board' | 'list';
      expect(legacyCall('list', true)).toBe('list');
      expect(legacyCall('kanban', true)).toBe('board');
    });
  });

  describe('PAGINATED_COLLECTION_PINNED_OPTIONS', () => {
    it('names exactly the controls a paginated collection overrides', () => {
      // Each pinned name must be a control the view options actually fix, or
      // the panel would hide a switch that still works.
      const pinned = getMyTaskViewOptions({
        ...DEFAULT_TASK_LIST_VIEW_OPTIONS,
        orderBy: 'title',
        orderDirection: 'desc',
        showSubTasks: false,
      });
      expect(PAGINATED_COLLECTION_PINNED_OPTIONS).toEqual(['ordering', 'showSubTasks']);
      expect(pinned.orderBy).toBe('updatedAt');
      expect(pinned.orderDirection).toBe('asc');
      expect(pinned.showSubTasks).toBe(true);
      // Not pinned: the panel keeps offering these, and they still take effect.
      expect(pinned.groupBy).toBe(DEFAULT_TASK_LIST_VIEW_OPTIONS.groupBy);
      expect(pinned.hideCompleted).toBe(DEFAULT_TASK_LIST_VIEW_OPTIONS.hideCompleted);
      expect(pinned.nestedSubTasks).toBe(DEFAULT_TASK_LIST_VIEW_OPTIONS.nestedSubTasks);
    });
  });

  describe('resolveTaskCollection', () => {
    it('opens the scheduled collection from its addressable URL', () => {
      expect(resolveTaskCollection(new URLSearchParams('collection=scheduled'))).toBe('scheduled');
    });

    it('falls back to ordinary tasks for absent or unknown values', () => {
      expect(resolveTaskCollection(new URLSearchParams())).toBe('tasks');
      expect(resolveTaskCollection(new URLSearchParams('collection=unknown'))).toBe('tasks');
    });

    it('opens "My tasks" only where the tab is offered', () => {
      const params = new URLSearchParams('collection=mine');
      expect(resolveTaskCollection(params, { allowMine: true })).toBe('mine');
      // Agent/project scopes and personal mode have no member assignment, so a
      // deep link into the tab lands on ordinary tasks instead of a blank view.
      expect(resolveTaskCollection(params, { allowMine: false })).toBe('tasks');
      expect(resolveTaskCollection(params)).toBe('tasks');
    });
  });

  describe('resolveMyTaskScope', () => {
    it('defaults to tasks assigned to me', () => {
      expect(resolveMyTaskScope(new URLSearchParams())).toBe('assigned');
      expect(resolveMyTaskScope(new URLSearchParams('scope=unknown'))).toBe('assigned');
    });

    it('opens the created sub-view from its addressable URL', () => {
      expect(resolveMyTaskScope(new URLSearchParams('scope=created'))).toBe('created');
    });
  });

  describe('getTaskCreateActionBehavior', () => {
    it('should allow workspace viewers to reopen the collapsed inline entry in list view', () => {
      expect(
        getTaskCreateActionBehavior({
          canCreateTask: false,
          inlineCollapsed: true,
          isBoardSurface: false,
        }),
      ).toEqual({ disabled: false, mode: 'inline' });
    });

    it('should keep the modal create action disabled for workspace viewers in kanban view', () => {
      expect(
        getTaskCreateActionBehavior({
          canCreateTask: false,
          inlineCollapsed: false,
          isBoardSurface: true,
        }),
      ).toEqual({ disabled: true, mode: 'modal' });
    });

    it('opens the create modal on the board surface even when the inline entry is collapsed', () => {
      // The empty-ordinary board has no inline composer to expand: its header
      // create must open the modal, exactly like the selected kanban view.
      expect(
        getTaskCreateActionBehavior({
          canCreateTask: true,
          inlineCollapsed: true,
          isBoardSurface: true,
        }),
      ).toEqual({ disabled: false, mode: 'modal' });
    });
  });

  describe('shouldRenderTaskAgentPanelToggle', () => {
    it('should render the task agent panel toggle on desktop layouts', () => {
      expect(shouldRenderTaskAgentPanelToggle(false)).toBe(true);
    });

    it('should hide the task agent panel toggle on mobile layouts', () => {
      expect(shouldRenderTaskAgentPanelToggle(true)).toBe(false);
    });
  });

  describe('getTaskPageHeaderVisibility', () => {
    it('keeps view options and the panel toggle on the empty global board', () => {
      // The board is the empty state now, so an empty global collection keeps
      // the same header chrome as any other board — the view switch included.
      expect(getTaskPageHeaderVisibility({ agentId: undefined, isMobile: false })).toEqual({
        showBreadcrumb: false,
        showTaskAgentPanelToggle: true,
        showVisibilityFilter: true,
        showViewOptions: true,
      });
    });

    it('keeps scoped task-list context on an agent scope', () => {
      expect(getTaskPageHeaderVisibility({ agentId: 'agent-1', isMobile: false })).toEqual({
        showBreadcrumb: true,
        showTaskAgentPanelToggle: true,
        // The agent scope's list is already narrowed to one assignee; the
        // visibility chip stays off it.
        showVisibilityFilter: false,
        showViewOptions: true,
      });
    });

    it('uses the project header and properties panel without duplicate task chrome', () => {
      expect(getTaskPageHeaderVisibility({ isMobile: false, projectId: 'p-1' })).toEqual({
        showBreadcrumb: false,
        showTaskAgentPanelToggle: false,
        // The regression this guards: the `!projectId` header gate used to
        // hide the visibility chip — the issues surface's only filter entry —
        // inside a project. It must stay on.
        showVisibilityFilter: true,
        showViewOptions: true,
      });
      expect(getTaskPageHeaderVisibility({ isMobile: false })).toEqual({
        showBreadcrumb: false,
        showTaskAgentPanelToggle: true,
        showVisibilityFilter: true,
        showViewOptions: true,
      });
    });

    it('hides the task agent panel toggle on mobile layouts', () => {
      expect(getTaskPageHeaderVisibility({ isMobile: true })).toEqual({
        showBreadcrumb: false,
        showTaskAgentPanelToggle: false,
        showVisibilityFilter: true,
        showViewOptions: true,
      });
    });
  });
});
