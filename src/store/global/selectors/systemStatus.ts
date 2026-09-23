import { type TopicGroupMode } from '@/types/topic';

import type { GlobalState, SystemStatus, WorkspaceOverridableField } from '../initialState';
import {
  DEFAULT_HOME_SIDEBAR_EXPANDED_KEYS,
  INITIAL_STATUS,
  WORKSPACE_OVERRIDABLE_FIELDS,
} from '../initialState';

/**
 * Read a workspace-overridable field from SystemStatus.
 * When `workspaceId` is non-null and the overlay carries the field, returns the overlay
 * value; otherwise falls back to the top-level (personal mode) value.
 */
export const readOverridableField = <K extends WorkspaceOverridableField>(
  status: SystemStatus,
  field: K,
  workspaceId: string | null,
): SystemStatus[K] => {
  if (workspaceId) {
    const overlay = status.workspace?.[field];
    if (overlay !== undefined) return overlay as SystemStatus[K];
  }
  return status[field];
};

const OVERRIDABLE_SET = new Set<string>(WORKSPACE_OVERRIDABLE_FIELDS);

/**
 * Reshape an `updateSystemStatus` patch when the user is inside a workspace:
 * whitelisted fields land in `workspace.*` so they do not bleed into personal
 * mode. Non-whitelisted fields stay at the top level. An explicit `workspace`
 * key in the patch is preserved and merged with the routed overlay.
 *
 * Pass `workspaceId = null` to bypass routing (init path, personal mode).
 */
export const routeOverlayWrites = (
  patch: Partial<SystemStatus>,
  workspaceId: string | null,
): Partial<SystemStatus> => {
  if (!workspaceId) return patch;

  const { workspace: explicitOverlay, ...rest } = patch;
  const overlayUpdates: Partial<Pick<SystemStatus, WorkspaceOverridableField>> = {};
  const topLevel: Partial<SystemStatus> = {};

  for (const key of Object.keys(rest)) {
    if (OVERRIDABLE_SET.has(key)) {
      (overlayUpdates as any)[key] = (rest as any)[key];
    } else {
      (topLevel as any)[key] = (rest as any)[key];
    }
  }

  const overlay = { ...explicitOverlay, ...overlayUpdates };
  return Object.keys(overlay).length > 0 ? { ...topLevel, workspace: overlay } : topLevel;
};

export const systemStatus = (s: GlobalState) => s.status;

// The Linear parity default `INITIAL_STATUS.leftPanelWidth` (244) sits only 4px
// above this floor. Raising the floor past 244 silently swallows it: the clamp
// returns the floor and nothing downstream can tell the parity value was rejected.
export const NAV_PANEL_MIN_WIDTH = 240;
export const NAV_PANEL_MAX_WIDTH = 400;
// Viewport width below which the nav panel auto-collapses into the header
// toggle instead of pinning a fixed column.
export const NAV_PANEL_AUTO_COLLAPSE_BELOW = 960;
// Session flag marking that the current collapsed nav state was set by the
// narrow-viewport auto-collapse (not by the user), so a wide relaunch restores.
export const NAV_PANEL_AUTO_COLLAPSED_KEY = 'nav-panel-auto-collapsed';

const normalizeNavPanelWidth = (width: number | string | undefined): number => {
  const parsed = typeof width === 'string' ? Number.parseInt(width) : width;
  const fallback = INITIAL_STATUS.leftPanelWidth;

  if (!parsed || !Number.isFinite(parsed)) return fallback;

  return Math.min(NAV_PANEL_MAX_WIDTH, Math.max(NAV_PANEL_MIN_WIDTH, parsed));
};

const agentBuilderPanelWidth = (s: GlobalState) => s.status.agentBuilderPanelWidth || 360;

const sessionGroupKeys =
  (workspaceId: string | null) =>
  (s: GlobalState): string[] => {
    const value = readOverridableField(s.status, 'expandSessionGroupKeys', workspaceId);
    return value || INITIAL_STATUS.expandSessionGroupKeys;
  };

const collapsedTopicGroupKeys =
  (mode: TopicGroupMode) =>
  (s: GlobalState): string[] | undefined =>
    s.status.collapsedTopicGroupKeysByMode?.[mode];

const agentSidebarSections =
  (agentId: string | undefined) =>
  (s: GlobalState): Record<string, boolean> | undefined =>
    agentId ? s.status.expandAgentSidebarSectionsByAgent?.[agentId] : undefined;

const topicPageSize = (s: GlobalState): number => s.status.topicPageSize || 20;

const agentPageSize = (s: GlobalState): number => s.status.agentPageSize || 5;

const privateAgentPageSize = (s: GlobalState): number => s.status.privateAgentPageSize || 5;

const favoritePageSize = (s: GlobalState): number => s.status.favoritePageSize || 5;

const recentPageSize = (s: GlobalState): number => s.status.recentPageSize || 5;

const pagePageSize = (s: GlobalState): number => s.status.pagePageSize || 20;
const taskListViewOptions = (s: GlobalState) =>
  s.status.taskListViewOptions || {
    groupBy: 'status',
    hideCompleted: false,
    nestedSubTasks: true,
    orderBy: 'updatedAt',
    orderCompletedByRecency: true,
    orderDirection: 'asc',
    showSubTasks: true,
    subGroupBy: 'none',
  };

const taskListViewMode = (s: GlobalState) => s.status.taskListViewMode ?? 'kanban';

// Default the inline composer to collapsed so a populated task list keeps the
// records at the top of the fold; the empty-state hero still shows the full
// composer, and the header "+" expands it inline on demand.
const taskCreateInlineCollapsed = (s: GlobalState): boolean =>
  s.status.taskCreateInlineCollapsed ?? true;

/** `done` stays visible so finished work is part of the default picture;
 * `canceled` starts folded away. A stored preference always wins. */
export const DEFAULT_KANBAN_HIDDEN_COLUMNS: string[] = ['canceled'];

const taskKanbanHiddenColumns = (s: GlobalState): string[] =>
  s.status.taskKanbanHiddenColumns ?? DEFAULT_KANBAN_HIDDEN_COLUMNS;

const taskKanbanHiddenPanelCollapsed = (s: GlobalState): boolean =>
  s.status.taskKanbanHiddenPanelCollapsed ?? false;

export const DEFAULT_HIDDEN_SECTIONS: string[] = [];

/** Sections hidden by default in workspace mode until the user customizes
 * sidebar visibility. `recents` lives in personal mode where the catch-all
 * stream is useful, but in a workspace the agent/project lists are the
 * primary entry points — surfacing recents on top adds noise. */
export const WORKSPACE_DEFAULT_HIDDEN_SECTIONS: string[] = [];

/** Sections hidden by default for the given mode. The customize-sidebar
 * "Reset to default" path uses this so resetting in a workspace restores
 * the workspace defaults, not the empty personal-mode defaults. */
export const getDefaultHiddenSections = (isWorkspaceMode: boolean): string[] =>
  isWorkspaceMode ? [...WORKSPACE_DEFAULT_HIDDEN_SECTIONS] : DEFAULT_HIDDEN_SECTIONS;

const hiddenSidebarSections =
  (workspaceId: string | null) =>
  (s: GlobalState): string[] => {
    if (workspaceId) {
      const overlay = s.status.workspace?.hiddenSidebarSections;
      // Once the user touches sidebar visibility in this workspace the overlay
      // owns the list — including an explicit empty array meaning "show all".
      if (overlay !== undefined) return withoutRetiredItems(overlay);
      // Untouched workspace: inherit any personal-mode hides and layer the
      // workspace defaults on top.
      const personal = s.status.hiddenSidebarSections ?? DEFAULT_HIDDEN_SECTIONS;
      const merged = [...personal];
      for (const k of WORKSPACE_DEFAULT_HIDDEN_SECTIONS) {
        if (!merged.includes(k)) merged.push(k);
      }
      return withoutRetiredItems(merged);
    }
    return withoutRetiredItems(s.status.hiddenSidebarSections ?? DEFAULT_HIDDEN_SECTIONS);
  };

/**
 * Keys the user folded away, in the same `team:<id>` vocabulary as
 * `sidebarExpandedKeys`. Empty means "nothing was ever folded", which is also
 * the state of every account that predates the field — those keys default to
 * expanded (Linear keeps a team's sub-navigation open until you close it).
 */
const sidebarCollapsedKeys =
  (workspaceId: string | null) =>
  (s: GlobalState): string[] =>
    readOverridableField(s.status, 'sidebarCollapsedKeys', workspaceId) ?? [];

const sidebarExpandedKeys =
  (workspaceId: string | null) =>
  (s: GlobalState): string[] =>
    withoutRetiredItems(
      readOverridableField(s.status, 'sidebarExpandedKeys', workspaceId) ??
        DEFAULT_HOME_SIDEBAR_EXPANDED_KEYS,
    );

/** Sentinel id representing the flex spacer slot. Its position in `sidebarItems`
 * determines where the sidebar pushes items to the bottom. */
export const SIDEBAR_SPACER_ID = '__spacer__';

/**
 * The fixed primary IA (Linear convergence): `sidebarItems` is contract-owned.
 * Core links (inbox / my-work / reviews) come first, then the optional
 * accordion sections (agent / workspace / favorites / teams), then the spacer
 * sentinel. Stored and workspace-synced preferences can only hide optional
 * sections via `hiddenSidebarSections` — they can never reorder the core
 * structure, so the selector returns this constant as-is.
 */
export const DEFAULT_SIDEBAR_ITEMS: string[] = [
  'inbox',
  'my-work',
  'reviews',
  'agent',
  'drafts',
  'create',
  'workspace',
  'favorites',
  'teams',
  SIDEBAR_SPACER_ID,
];

/**
 * Sidebar keys whose product surface has been withdrawn by the task-first
 * convergence and the Linear IA swap. See docs/development/product-scope.md
 * and src/features/Navigation/sidebarContract.ts.
 *
 * Retired keys can never resurface: `sidebarItems` ignores stored order
 * entirely, and `hiddenSidebarSections` / `sidebarExpandedKeys` strip these
 * keys on the read path so stored, overlaid, and re-synced state all pass
 * through it. The routes behind them stay reachable as deep links.
 *
 * Both spellings of the documents key are listed: the sidebar stores `pages`
 * (its `SidebarTabKey`), while the route registry uses `page`.
 */
export const RETIRED_SIDEBAR_KEYS = new Set([
  'community',
  'image',
  'memory',
  'page',
  'pages',
  // Linear IA convergence: retired from the PRIMARY sidebar. Routes stay
  // reachable (/tasks, /automations, /resource, /projects) via Workspace → More,
  // team pages, search and existing deep links — the keys just cannot resurface.
  'home',
  'tasks',
  'automations',
  'resource',
  'recents',
  'private',
  'project',
  'views',
]);

/**
 * Drop retired keys from a stored sidebar order.
 *
 * Idempotent, and returns the original reference when there is nothing to strip.
 * Reference stability matters because the result feeds a zustand selector: a
 * freshly built array on every read breaks the store's snapshot bail-out in
 * `useSyncExternalStore`, which costs a re-render per subscriber and can trip
 * the "getSnapshot should be cached" warning. Keeping the same reference also
 * makes a second pass a provable no-op.
 */
const withoutRetiredItems = (items: string[]): string[] => {
  let seen = false;
  for (const item of items) {
    if (RETIRED_SIDEBAR_KEYS.has(item)) {
      seen = true;
      break;
    }
  }
  return seen ? items.filter((item) => !RETIRED_SIDEBAR_KEYS.has(item)) : items;
};

/** The accordion sections of the fixed IA — contiguous in the sidebar list
 * and the only entries the user may hide via `hiddenSidebarSections`. */
export const SIDEBAR_ACCORDION_KEYS = new Set(['workspace', 'favorites', 'teams']);

const DEFAULT_BOTTOM_KEYS = new Set(
  DEFAULT_SIDEBAR_ITEMS.slice(DEFAULT_SIDEBAR_ITEMS.indexOf(SIDEBAR_SPACER_ID) + 1),
);

const arraysEqual = (a: string[], b: string[]): boolean => {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

// Invariant: the spacer always sits immediately after the accordion block.
// Any stored position is ignored — the spacer is re-anchored on every read so
// legacy states (e.g. from the move-up/down dropdown that used to leave the
// spacer floating above the accordion) self-heal.
const normalizeSpacerPosition = (order: string[]): string[] => {
  const withoutSpacer = order.filter((k) => k !== SIDEBAR_SPACER_ID);

  let insertAt = -1;
  for (let i = withoutSpacer.length - 1; i >= 0; i--) {
    if (SIDEBAR_ACCORDION_KEYS.has(withoutSpacer[i])) {
      insertAt = i + 1;
      break;
    }
  }
  if (insertAt === -1) {
    const bottomIdx = withoutSpacer.findIndex((k) => DEFAULT_BOTTOM_KEYS.has(k));
    insertAt = bottomIdx === -1 ? withoutSpacer.length : bottomIdx;
  }

  return [...withoutSpacer.slice(0, insertAt), SIDEBAR_SPACER_ID, ...withoutSpacer.slice(insertAt)];
};

const accordionIndices = (items: string[]): number[] => {
  const out: number[] = [];
  for (let i = 0; i < items.length; i++) {
    if (SIDEBAR_ACCORDION_KEYS.has(items[i])) out.push(i);
  }
  return out;
};

const reorderInner = (items: string[], from: number, to: number): string[] => {
  const key = items[from];
  const accIdx = accordionIndices(items);

  // Moving an accordion item across the block's outer boundary → move whole block together.
  if (SIDEBAR_ACCORDION_KEYS.has(key) && accIdx.length >= 2) {
    const first = accIdx[0];
    const last = accIdx.at(-1)!;
    const crossesBoundary = (from === first && to < first) || (from === last && to > last);
    if (crossesBoundary) {
      const block = items.slice(first, last + 1);
      const without = [...items.slice(0, first), ...items.slice(last + 1)];
      // After removing the block, adjust target index for upward/downward movement
      const targetIdx = to < first ? to : to - (last - first + 1) + 1;
      const clamped = Math.max(0, Math.min(without.length, targetIdx));
      return [...without.slice(0, clamped), ...block, ...without.slice(clamped)];
    }
  }

  // Standard reorder
  const moved = [...items];
  const [removed] = moved.splice(from, 1);
  moved.splice(to, 0, removed);

  // Non-accordion item that landed between accordion items → snap to the side matching drag direction.
  if (!SIDEBAR_ACCORDION_KEYS.has(key)) {
    const nextAcc = accordionIndices(moved);
    if (nextAcc.length >= 2) {
      const first = nextAcc[0];
      const last = nextAcc.at(-1)!;
      const contiguous = last - first === nextAcc.length - 1;
      if (!contiguous) {
        const pos = moved.indexOf(key);
        if (pos > first && pos < last) {
          const cleaned = [...moved];
          cleaned.splice(pos, 1);
          const cAcc = accordionIndices(cleaned);
          const insertAt = from < to ? cAcc.at(-1)! + 1 : cAcc[0];
          cleaned.splice(insertAt, 0, key);
          return cleaned;
        }
      }
    }
  }

  return moved;
};

/**
 * Reorder sidebar items while keeping the accordion block (recents + agent) contiguous
 * and the spacer immediately after the accordion block. Returns the original `items`
 * reference when the move resolves to a no-op (e.g. dragging the accordion past the
 * spacer, which the invariant snaps right back), so callers can short-circuit on
 * reference equality.
 */
export const reorderSidebarItems = (items: string[], from: number, to: number): string[] => {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items;
  }
  const normalized = normalizeSpacerPosition(reorderInner(items, from, to));
  return arraysEqual(normalized, items) ? items : normalized;
};

/**
 * The primary IA is a fixed contract (see `features/Navigation/sidebarContract`):
 * stored or workspace-synced preferences may hide optional sections via
 * `hiddenSidebarSections`, but they can never reorder the core structure or
 * resurrect retired keys — the read path always yields the canonical order.
 * Returning the constant keeps snapshot stability for zustand subscribers.
 */
const sidebarItems =
  (_workspaceId: string | null) =>
  (s: GlobalState): string[] => {
    void s;
    return DEFAULT_SIDEBAR_ITEMS;
  };
const showSystemRole = (s: GlobalState) => s.status.showSystemRole;
const mobileShowTopic = (s: GlobalState) => s.status.mobileShowTopic;
const mobileShowPortal = (s: GlobalState) => s.status.mobileShowPortal;
const showAgentBuilderPanel = (s: GlobalState) => s.status.showAgentBuilderPanel;
const showHomeRail = (s: GlobalState) => s.status.showHomeRail ?? true;
const hiddenHomeWidgets = (s: GlobalState): string[] => s.status.hiddenHomeWidgets ?? [];
const homeGoalsCollapsed = (s: GlobalState): boolean => s.status.homeGoalsCollapsed ?? false;
const homeRecentsCount = (s: GlobalState): number => s.status.homeRecentsCount ?? 8;
const homeTaskCount = (s: GlobalState): number => s.status.homeTaskCount ?? 8;
const showRightPanel = (s: GlobalState) => s.status.showRightPanel;
const showLeftPanel = (s: GlobalState) => s.status.showLeftPanel;
const showPageAgentPanel = (s: GlobalState) => s.status.showPageAgentPanel;
const showTaskAgentPanel = (s: GlobalState) => s.status.showTaskAgentPanel;
const showTerminalPanel = (s: GlobalState) => s.status.showTerminalPanel;
const terminalPanelHeight = (s: GlobalState) => s.status.terminalPanelHeight || 320;
const showFilePanel = (s: GlobalState) => s.status.showFilePanel;
const showVerifyReportPanel = (s: GlobalState) => s.status.showVerifyReportPanel ?? true;
const hidePWAInstaller = (s: GlobalState) => s.status.hidePWAInstaller;
const isShowCredit = (s: GlobalState) => s.status.isShowCredit;
const language = (s: GlobalState) => s.status.language || 'auto';
const pageAgentPanelWidth = (s: GlobalState) => s.status.pageAgentPanelWidth || 360;
const workingSidebarWidth = (s: GlobalState) => s.status.workingSidebarWidth || 360;

const leftPanelWidth = (s: GlobalState): number => {
  return normalizeNavPanelWidth(s.status.leftPanelWidth);
};
const portalWidth = (s: GlobalState) => s.status.portalWidth || 400;
const portalWidths = (s: GlobalState) => s.status.portalWidths;
const filePanelWidth = (s: GlobalState) => s.status.filePanelWidth;
const groupAgentBuilderPanelWidth = (s: GlobalState) => s.status.groupAgentBuilderPanelWidth || 360;
const agentListViewMode = (s: GlobalState) => s.status.agentListViewMode || 'list';
const agentListViewOptions = (s: GlobalState) => s.status.agentListViewOptions;
const agentListExpandedGroupKeys = (s: GlobalState) => s.status.agentListExpandedGroupKeys ?? [];
const agentListSidebarSectionCollapsed = (s: GlobalState) =>
  s.status.agentListSidebarSectionCollapsed ?? false;
const verifyReportPanelWidth = (s: GlobalState) => s.status.verifyReportPanelWidth || 300;
const wideScreen = (s: GlobalState) => !s.status.noWideScreen;
const chatInputHeight = (s: GlobalState) => s.status.chatInputHeight || 64;
const expandInputActionbar = (s: GlobalState) => s.status.expandInputActionbar;
const isStatusInit = (s: GlobalState) => !!s.isStatusInit;

const getAgentSystemRoleExpanded =
  (agentId: string) =>
  (s: GlobalState): boolean => {
    const map = s.status.systemRoleExpandedMap || {};
    return map[agentId] === true; // System role is collapsed by default
  };

const disabledModelProvidersSortType = (s: GlobalState) =>
  s.status.disabledModelProvidersSortType || 'default';
const disabledModelsSortType = (s: GlobalState) => s.status.disabledModelsSortType || 'default';

const isNotificationRead =
  (slug: string) =>
  (s: GlobalState): boolean => {
    const slugs = s.status.readNotificationSlugs || [];
    return slugs.includes(slug);
  };

const isBannerDismissed =
  (bannerId: string) =>
  (s: GlobalState): boolean => {
    const ids = s.status.dismissedBannerIds || [];
    return ids.includes(bannerId);
  };
const tokenDisplayFormatShort = (s: GlobalState) =>
  s.status.tokenDisplayFormatShort !== undefined ? s.status.tokenDisplayFormatShort : true;

const homeSelectedAgentId = (s: GlobalState) => s.status.homeSelectedAgentId;

export const systemStatusSelectors = {
  agentBuilderPanelWidth,
  agentListExpandedGroupKeys,
  agentListSidebarSectionCollapsed,
  agentListViewMode,
  agentListViewOptions,
  agentPageSize,
  chatInputHeight,
  disabledModelProvidersSortType,
  disabledModelsSortType,
  expandInputActionbar,
  favoritePageSize,
  filePanelWidth,
  getAgentSystemRoleExpanded,
  groupAgentBuilderPanelWidth,
  hiddenHomeWidgets,
  hiddenSidebarSections,
  hidePWAInstaller,
  homeGoalsCollapsed,
  homeRecentsCount,
  homeSelectedAgentId,
  homeTaskCount,
  isBannerDismissed,
  isNotificationRead,
  isShowCredit,
  isStatusInit,
  language,
  leftPanelWidth,
  mobileShowPortal,
  mobileShowTopic,
  pageAgentPanelWidth,
  pagePageSize,
  portalWidth,
  portalWidths,
  privateAgentPageSize,
  recentPageSize,
  taskCreateInlineCollapsed,
  taskKanbanHiddenColumns,
  taskKanbanHiddenPanelCollapsed,
  taskListViewMode,
  taskListViewOptions,
  sidebarCollapsedKeys,
  sidebarExpandedKeys,
  agentSidebarSections,
  sidebarItems,
  sessionGroupKeys,
  showAgentBuilderPanel,
  showFilePanel,
  showHomeRail,
  showLeftPanel,
  showPageAgentPanel,
  showRightPanel,
  showSystemRole,
  showTaskAgentPanel,
  showTerminalPanel,
  showVerifyReportPanel,
  systemStatus,
  terminalPanelHeight,
  verifyReportPanelWidth,
  tokenDisplayFormatShort,
  collapsedTopicGroupKeys,
  topicPageSize,
  wideScreen,
  workingSidebarWidth,
};
