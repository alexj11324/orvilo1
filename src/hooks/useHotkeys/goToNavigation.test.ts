import { INBOX_SESSION_ID } from '@orvilo/const';
import { HotkeyEnum, HOTKEYS_REGISTRATION } from '@orvilo/const/hotkeys';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import hotkeyMeta from '@/locales/default/hotkey';
import type { HotkeyId } from '@/types/hotkey';

import {
  GO_TO_DESTINATIONS,
  useCreateTaskHotkey,
  useGoToAgentHotkey,
  useRegisterGoToHotkeys,
} from './globalScope';

type RegisteredHotkey = {
  callback: () => void;
  options?: unknown;
};

const mocks = vi.hoisted(() => ({
  builtinOffered: false,
  createTaskModal: vi.fn(),
  fallbackAgentId: 'agent-1' as string | undefined,
  navigate: vi.fn(),
  navigateToAgent: vi.fn(),
  registered: new Map<HotkeyId, RegisteredHotkey>(),
  useHotkeyById: vi.fn(),
}));

vi.mock('react-router', () => ({
  useLocation: () => ({ pathname: '/' }),
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('@/features/AgentTasks/CreateTaskModal', () => ({
  createTaskModal: mocks.createTaskModal,
}));

vi.mock('@/features/DefaultAgent/useFallbackAgentId', () => ({
  useFallbackAgentId: () => mocks.fallbackAgentId,
}));

vi.mock('@/features/HeterogeneousAgent/builtinHarness', () => ({
  useBuiltinHarnessOffered: () => mocks.builtinOffered,
}));

vi.mock('@/hooks/useNavigateToAgent', () => ({
  useNavigateToAgent: () => mocks.navigateToAgent,
}));

vi.mock('@/hooks/usePinnedAgentState', () => ({
  usePinnedAgentState: () => [undefined, { unpinAgent: vi.fn() }],
}));

vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: { status: object }) => unknown) => selector({ status: {} }),
}));

vi.mock('./useHotkeyById', () => ({
  useHotkeyById: (id: HotkeyId, callback: () => void, options?: unknown) => {
    mocks.registered.set(id, { callback, options });
    return mocks.useHotkeyById(id, callback, options);
  },
}));

describe('GO_TO_DESTINATIONS', () => {
  it('covers every active go-to chord exactly once', () => {
    expect(GO_TO_DESTINATIONS.map((d) => d.id)).toEqual([
      HotkeyEnum.GoToInbox,
      HotkeyEnum.GoToMyIssues,
      HotkeyEnum.GoToReviews,
      HotkeyEnum.GoToDrafts,
      HotkeyEnum.GoToProjects,
      HotkeyEnum.GoToViews,
    ]);
    const paths = GO_TO_DESTINATIONS.map((d) => d.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('lands on real routes', () => {
    for (const { path } of GO_TO_DESTINATIONS) {
      expect(path).toMatch(/^\/[a-z-]+$/);
    }
  });

  it('pairs every destination with a registered sequence hotkey', () => {
    for (const { id } of GO_TO_DESTINATIONS) {
      const item = HOTKEYS_REGISTRATION.find((entry) => entry.id === id);
      expect(item, `missing registration for ${id}`).toBeDefined();
      expect(item?.keys).toMatch(/^g>[a-z]$/);
    }
  });

  it('has a hotkey locale title for every destination id', () => {
    for (const { id } of GO_TO_DESTINATIONS) {
      expect(hotkeyMeta[`${id}.title` as keyof typeof hotkeyMeta]).toBeTruthy();
    }
  });
});

describe('useRegisterGoToHotkeys', () => {
  beforeEach(() => {
    mocks.registered.clear();
    mocks.navigate.mockReset();
    mocks.createTaskModal.mockReset();
  });

  it('registers one hotkey per destination and navigates to its path', () => {
    renderHook(() => useRegisterGoToHotkeys());

    expect(mocks.registered.size).toBe(GO_TO_DESTINATIONS.length);

    for (const { id, path } of GO_TO_DESTINATIONS) {
      const entry = mocks.registered.get(id);
      expect(entry, `no useHotkeyById call for ${id}`).toBeDefined();
      expect(entry?.options).toMatchObject({ enableOnFormTags: false });

      act(() => {
        entry?.callback();
      });

      expect(mocks.navigate).toHaveBeenLastCalledWith(path);
    }
  });
});

describe('useGoToAgentHotkey', () => {
  beforeEach(() => {
    mocks.registered.clear();
    mocks.navigateToAgent.mockReset();
    mocks.builtinOffered = false;
    mocks.fallbackAgentId = 'agent-1';
  });

  it('registers g>j as a page-level chord and opens the default agent surface', () => {
    renderHook(() => useGoToAgentHotkey());

    const entry = mocks.registered.get(HotkeyEnum.GoToAgent);
    expect(entry).toBeDefined();
    expect(entry?.options).toMatchObject({ enableOnFormTags: false });

    act(() => {
      entry?.callback();
    });

    expect(mocks.navigateToAgent).toHaveBeenCalledWith('agent-1');
  });

  it('opens the inbox agent while the built-in harness is offered', () => {
    mocks.builtinOffered = true;
    renderHook(() => useGoToAgentHotkey());

    act(() => {
      mocks.registered.get(HotkeyEnum.GoToAgent)?.callback();
    });

    expect(mocks.navigateToAgent).toHaveBeenCalledWith(INBOX_SESSION_ID);
  });

  it('does nothing when no agent can be resolved', () => {
    mocks.fallbackAgentId = undefined;
    renderHook(() => useGoToAgentHotkey());

    act(() => {
      mocks.registered.get(HotkeyEnum.GoToAgent)?.callback();
    });

    expect(mocks.navigateToAgent).not.toHaveBeenCalled();
  });
});

describe('useCreateTaskHotkey', () => {
  beforeEach(() => {
    mocks.registered.clear();
    mocks.createTaskModal.mockReset();
  });

  it('opens the create task modal via a lazy import', async () => {
    renderHook(() => useCreateTaskHotkey());

    const entry = mocks.registered.get(HotkeyEnum.CreateTask);
    expect(entry).toBeDefined();
    expect(entry?.options).toMatchObject({ enableOnFormTags: false });

    entry?.callback();

    await vi.waitFor(() => {
      expect(mocks.createTaskModal).toHaveBeenCalledTimes(1);
    });
  });
});
