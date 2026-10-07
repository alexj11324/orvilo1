import type { TaskDetailData } from '@orvilo/types';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useTaskStore } from '@/store/task';

import TaskDetailPage from './TaskDetailPage';
import { formatCountdown, shouldPersistFallbackAssignee } from './TaskDetailRunPauseAction';

const api = vi.hoisted(() => ({
  canUseAgent: true,
  canUseByAgent: undefined as Record<string, boolean> | undefined,
  resourceAccess: vi.fn(),
  contractContext: vi.fn(),
  confirmModal: vi.fn((options: { onOk: () => void }) => options.onOk()),
  runMutation: vi.fn(),
}));

vi.mock('@/libs/trpc/client', () => ({
  lambdaClient: {
    task: {
      contractContext: { query: api.contractContext },
      run: { mutate: api.runMutation },
    },
  },
}));
vi.mock('@/components/Modal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  confirmModal: api.confirmModal,
}));
vi.mock('@/features/ResourcePermission/useResourceAccess', () => ({
  useResourceAccess: (type: string, id?: string) => api.resourceAccess(type, id),
}));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: true }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/store/agent', () => ({ useAgentStore: () => undefined }));
vi.mock('@/store/global', () => ({
  useGlobalStore: (selector: (state: { toggleTaskAgentPanel: () => void }) => unknown) =>
    selector({ toggleTaskAgentPanel: () => {} }),
}));
vi.mock('@/store/global/selectors', () => ({
  systemStatusSelectors: { showTaskAgentPanel: () => false },
}));
vi.mock('@/features/NavHeader', () => ({
  default: ({ left, right }: { left?: ReactNode; right?: ReactNode }) =>
    createElement('header', null, left, right),
}));
vi.mock('@/features/HomeSidebar/Body/WorkFavoriteButton', () => ({ default: () => null }));
vi.mock('@/features/RightPanel/ToggleRightPanelButton', () => ({ default: () => null }));
vi.mock('@/features/WorkSurface', () => ({
  WorkSurface: ({ children }: { children: ReactNode }) => createElement('main', null, children),
  WorkSurfaceDocument: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('../shared/Breadcrumb', () => ({ default: () => null }));
vi.mock('./TaskDetailHeaderActions', () => ({ default: () => null }));
vi.mock('./IssueContent', () => ({ default: () => null }));
vi.mock('./TopicChatDrawer', () => ({ default: () => null }));
vi.mock('./useActiveTaskDetail', () => ({
  useActiveTaskDetail: () => ({ isNotFound: false, isInitialLoading: false, onRetry: () => {} }),
}));

describe('formatCountdown', () => {
  it('keeps the precise countdown for durations shorter than one day', () => {
    expect(formatCountdown((23 * 3600 + 59 * 60 + 59) * 1000)).toEqual({
      countdown: '23:59:59',
      type: 'time',
    });
  });

  it('formats durations of at least one day as days and hours', () => {
    expect(formatCountdown((2 * 86_400 + 16 * 3600 + 55 * 60 + 28) * 1000)).toEqual({
      days: 2,
      hours: 16,
      type: 'days',
    });
  });

  it('clamps expired countdowns to zero', () => {
    expect(formatCountdown(-1000)).toEqual({ countdown: '00:00', type: 'time' });
  });
});

describe('shouldPersistFallbackAssignee', () => {
  it('uses the inbox agent only when the task has no assignee', () => {
    expect(shouldPersistFallbackAssignee(null, null, 'inbox-agent')).toBe(true);
    expect(shouldPersistFallbackAssignee('agent-1', null, 'inbox-agent')).toBe(false);
    expect(shouldPersistFallbackAssignee(null, 'user-1', 'inbox-agent')).toBe(false);
    expect(shouldPersistFallbackAssignee(null, null, null)).toBe(false);
  });
});

describe('task detail failure recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.canUseAgent = true;
    api.canUseByAgent = undefined;
    api.resourceAccess.mockImplementation((_type: string, id?: string) => ({
      canUseResource: api.canUseByAgent?.[id ?? ''] ?? api.canUseAgent,
    }));
    api.runMutation.mockResolvedValue({ success: true });
    const failedTask = {
      identifier: 'T-5',
      instruction: 'Verify the recovered task',
      status: 'failed',
      agentId: 'journey-agent',
      dispatchPhase: 'failed',
      workflowCategory: 'in_progress',
      dependencies: [],
    } satisfies TaskDetailData;
    useTaskStore.setState({
      activeTaskId: 'T-6',
      taskDetailMap: { 'T-5': failedTask },
      internal_refreshTaskDetail: vi.fn().mockResolvedValue(undefined),
      refreshTaskList: vi.fn().mockResolvedValue(undefined),
    });
  });

  it.each([
    { parentUse: true, childUse: false, explicitParentId: false },
    { parentUse: false, childUse: true, explicitParentId: false },
    { parentUse: true, childUse: false, explicitParentId: true },
  ])(
    'uses the parent run for Stop with parentUse=$parentUse childUse=$childUse explicitParentId=$explicitParentId',
    async ({ parentUse, childUse, explicitParentId }) => {
      api.canUseByAgent = {
        'parent-agent': parentUse,
        'child-agent': childUse,
        'field-assignee': false,
      };
      api.canUseAgent = false;
      useTaskStore.setState({
        taskDetailMap: {
          'T-5': {
            ...useTaskStore.getState().taskDetailMap['T-5'],
            id: 'parent-canonical-id',
            status: 'running',
            agentId: 'field-assignee',
            activities: [
              {
                type: 'topic',
                status: 'running',
                sourceTaskId: 'child-canonical-id',
                agentId: 'child-agent',
                time: '2026-10-01T01:00:00Z',
              },
              {
                type: 'topic',
                status: 'running',
                sourceTaskId: explicitParentId ? 'parent-canonical-id' : undefined,
                author: { type: 'agent', id: 'parent-agent', name: 'Parent executor' },
                time: '2026-10-01T02:00:00Z',
              },
            ],
          },
        },
      });
      render(createElement(TaskDetailPage, { taskId: 'T-5' }));
      const button = await screen.findByRole('button', { name: 'taskDetail.stopTask' });
      if (parentUse) expect(button).toBeEnabled();
      else expect(button).toBeDisabled();
      expect(api.resourceAccess).toHaveBeenCalledWith('agent', 'parent-agent');
      expect(api.resourceAccess).not.toHaveBeenCalledWith('agent', 'child-agent');
    },
  );

  it.each(['failed', 'running'] as const)(
    'disables execution for a member without Agent Use while %s',
    async (status) => {
      api.canUseAgent = false;
      useTaskStore.setState({
        taskDetailMap: { 'T-5': { ...useTaskStore.getState().taskDetailMap['T-5'], status } },
      });
      render(createElement(TaskDetailPage, { taskId: 'T-5' }));
      const button = await screen.findByRole('button', {
        name: status === 'running' ? 'taskDetail.stopTask' : 'taskDetail.runTask',
      });
      expect(button).toBeDisabled();
      await userEvent.click(button);
      expect(api.contractContext).not.toHaveBeenCalled();
      expect(api.runMutation).not.toHaveBeenCalled();
    },
  );

  it.each([
    { status: 'paused', pendingConstraintEdits: false },
    { status: 'failed', pendingConstraintEdits: true },
  ])(
    'offers scoped recovery for a failed dispatch with $status status',
    async ({ status, pendingConstraintEdits }) => {
      useTaskStore.setState({
        taskDetailMap: { 'T-5': { ...useTaskStore.getState().taskDetailMap['T-5'], status } },
      });
      api.contractContext.mockResolvedValue({
        data: { pendingConstraintEdits, contract: { revision: 2 } },
      });
      render(createElement(TaskDetailPage, { taskId: 'T-5' }));
      await userEvent.click(await screen.findByRole('button', { name: 'taskDetail.runTask' }));

      expect(api.contractContext).toHaveBeenCalledWith({ id: 'T-5' });
      await waitFor(() => expect(api.runMutation).toHaveBeenCalledTimes(1));
      expect(api.runMutation).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'T-5', idempotencyKey: expect.any(String) }),
      );
      expect(api.runMutation.mock.calls[0][0].intent).toBe(
        pendingConstraintEdits ? 'repair' : undefined,
      );
      expect(api.confirmModal).toHaveBeenCalledTimes(pendingConstraintEdits ? 1 : 0);
    },
  );
});
