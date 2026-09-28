import { INBOX_SESSION_ID } from '@orvilo/const';
import { HotkeyEnum } from '@orvilo/const/hotkeys';
import { useLocation } from 'react-router';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useNavigateToAgent } from '@/hooks/useNavigateToAgent';
import { usePinnedAgentState } from '@/hooks/usePinnedAgentState';
import { useGlobalStore } from '@/store/global';
import { type HotkeyId } from '@/types/hotkey';

import { useHotkeyById } from './useHotkeyById';

/**
 * Task routes render AgentTaskManager, whose panel status is intentionally
 * independent from the generic right panel used by chat and page editor routes.
 */
export const isTaskPanelRoute = (pathname: string) =>
  pathname === '/tasks' || pathname.startsWith('/tasks/') || pathname.startsWith('/task/');

/**
 * Agent profile renders AgentBuilder, whose panel status is intentionally
 * independent from the generic right panel used by chat routes.
 */
export const isAgentProfilePanelRoute = (pathname: string) =>
  /^\/agent\/[^/]+\/profile\/?$/.test(pathname);

// Switch to chat tab (and focus on Orvilo AI)
export const useNavigateToChatHotkey = () => {
  const navigateToAgent = useNavigateToAgent();
  const [, { unpinAgent }] = usePinnedAgentState();

  return useHotkeyById(HotkeyEnum.NavigateToChat, () => {
    navigateToAgent(INBOX_SESSION_ID);
    unpinAgent();
  });
};

export const useOpenHotkeyHelperHotkey = () => {
  const [open, updateSystemStatus] = useGlobalStore((s) => [
    s.status.showHotkeyHelper,
    s.updateSystemStatus,
  ]);

  // `?` must not fire while typing — Linear keeps it page-level only.
  return useHotkeyById(
    HotkeyEnum.OpenHotkeyHelper,
    () => updateSystemStatus({ showHotkeyHelper: !open }),
    { enableOnFormTags: false },
  );
};

export const useToggleLeftPanelHotkey = () => {
  const toggleLeftPanel = useGlobalStore((s) => s.toggleLeftPanel);
  return useHotkeyById(HotkeyEnum.ToggleLeftPanel, () => toggleLeftPanel(), {
    enableOnContentEditable: true,
  });
};

export const useToggleRightPanelHotkey = () => {
  const { pathname } = useLocation();
  const [toggleAgentBuilderPanel, toggleRightPanel, toggleTaskAgentPanel] = useGlobalStore((s) => [
    s.toggleAgentBuilderPanel,
    s.toggleRightPanel,
    s.toggleTaskAgentPanel,
  ]);
  const isAgentProfileRoute = isAgentProfilePanelRoute(pathname);
  const isTaskRoute = isTaskPanelRoute(pathname);

  return useHotkeyById(
    HotkeyEnum.ToggleRightPanel,
    () => {
      if (isTaskRoute) {
        toggleTaskAgentPanel();
        return;
      }

      if (isAgentProfileRoute) {
        toggleAgentBuilderPanel();
        return;
      }

      toggleRightPanel();
    },
    {
      enableOnContentEditable: true,
    },
    [
      isAgentProfileRoute,
      isTaskRoute,
      toggleAgentBuilderPanel,
      toggleRightPanel,
      toggleTaskAgentPanel,
    ],
  );
};

// CMDK
export const useCommandPaletteHotkey = () => {
  const toggleCommandMenu = useGlobalStore((s) => s.toggleCommandMenu);

  return useHotkeyById(HotkeyEnum.CommandPalette, () => toggleCommandMenu(), {
    enableOnContentEditable: true,
  });
};

/**
 * Bare-key hotkeys (`c`, `g>x` sequences) must stay page-level: enabling them
 * on form tags or contentEditable would steal plain typing, which is exactly
 * what the default `enableOnFormTags: true` in `useHotkeyById` would do.
 */
const BARE_KEY_HOTKEY_OPTIONS = { enableOnFormTags: false } as const;

/**
 * Linear's `C` — open the create-task modal. The modal module pulls in the
 * editor chunk, so it is imported lazily inside the callback (same reasoning
 * as `CmdkLazy`): the always-on hotkey layer stays free of editor code.
 */
export const useCreateTaskHotkey = () =>
  useHotkeyById(
    HotkeyEnum.CreateTask,
    () => {
      void import('@/features/AgentTasks/CreateTaskModal').then(({ createTaskModal }) =>
        createTaskModal(),
      );
    },
    BARE_KEY_HOTKEY_OPTIONS,
  );

/**
 * Linear's `g then x` go-to navigation. Each entry pairs a registered
 * `goTo*` hotkey id with the route it lands on; `useWorkspaceAwareNavigate`
 * prefixes the active workspace slug automatically, matching sidebar links.
 */
export const GO_TO_DESTINATIONS: ReadonlyArray<{ id: HotkeyId; path: string }> = [
  { id: HotkeyEnum.GoToInbox, path: '/inbox' },
  { id: HotkeyEnum.GoToMyIssues, path: '/my-issues' },
  { id: HotkeyEnum.GoToReviews, path: '/reviews' },
  { id: HotkeyEnum.GoToDrafts, path: '/drafts' },
  { id: HotkeyEnum.GoToProjects, path: '/projects' },
  { id: HotkeyEnum.GoToViews, path: '/views' },
];

const useGoToHotkey = (hotkeyId: HotkeyId, path: string) => {
  const navigate = useWorkspaceAwareNavigate();

  return useHotkeyById(
    hotkeyId,
    () => {
      navigate(path);
    },
    BARE_KEY_HOTKEY_OPTIONS,
    [navigate, path],
  );
};

export const useRegisterGoToHotkeys = () => {
  for (const { id, path } of GO_TO_DESTINATIONS) {
    // The list is a module constant, so call order never changes between
    // renders — safe under rules-of-hooks.
    useGoToHotkey(id, path);
  }
};

export const useRegisterGlobalHotkeys = () => {
  // Global auto-registration doesn't need enableScope
  useToggleLeftPanelHotkey();
  useToggleRightPanelHotkey();
  useNavigateToChatHotkey();
  useOpenHotkeyHelperHotkey();
  useCommandPaletteHotkey();
  useCreateTaskHotkey();
  useRegisterGoToHotkeys();
};
