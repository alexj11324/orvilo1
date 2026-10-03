import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useAutomationActions } from './useAutomationActions';

const boundary = vi.hoisted(() => ({
  updateTaskStatus: vi.fn(),
  list: vi.fn(),
  pause: vi.fn(),
  enable: vi.fn(),
  navigate: vi.fn(),
  mutate: vi.fn(),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/features/AgentTasks/AgentTaskDetail/TaskDetailRunPauseAction', () => ({
  shouldPersistFallbackAssignee: () => false,
}));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => boundary.navigate,
}));
vi.mock('@/libs/swr', () => ({ mutate: boundary.mutate }));
vi.mock('@/services/mcpEvents', () => ({
  mcpEventsService: { list: boundary.list, pause: boundary.pause, enable: boundary.enable },
}));
vi.mock('@/store/agent', () => ({ useAgentStore: () => undefined }));
vi.mock('@/store/agent/selectors', () => ({
  builtinAgentSelectors: { inboxAgentId: () => undefined },
}));
vi.mock('@/store/task', () => ({
  useTaskStore: (selector: any) => selector({ updateTaskStatus: boundary.updateTaskStatus }),
}));

const event = { automationMode: 'event' as const, id: 'task-id', identifier: 'T-1' };

beforeEach(() => {
  vi.resetAllMocks();
  boundary.list.mockResolvedValue({ data: { triggers: [{ enabled: true, revision: 4 }] } });
  boundary.pause.mockResolvedValue(undefined);
  boundary.mutate.mockResolvedValue(undefined);
  boundary.updateTaskStatus.mockResolvedValue(undefined);
});

describe('automation lifecycle actions', () => {
  it('pauses the event trigger using its observed revision without canceling the current Task run', async () => {
    const { result } = renderHook(useAutomationActions);
    await act(async () => result.current.pause(event));
    expect(boundary.list).toHaveBeenCalledWith('task-id');
    expect(boundary.pause).toHaveBeenCalledWith('task-id', 4);
    expect(boundary.updateTaskStatus).not.toHaveBeenCalled();
    expect(boundary.mutate).toHaveBeenCalledWith(['mcpEvents:triggers', 'task-id']);
  });

  it('opens event settings instead of bypassing readiness on resume', async () => {
    const { result } = renderHook(useAutomationActions);
    await act(async () => expect(await result.current.resume(event)).toBe('settings'));
    expect(boundary.navigate).toHaveBeenCalledWith('/automations/T-1?tab=settings');
    expect(boundary.updateTaskStatus).not.toHaveBeenCalled();
    expect(boundary.enable).not.toHaveBeenCalled();
  });

  it('does not report success if an event pause loses its revision CAS', async () => {
    boundary.pause.mockRejectedValue(new Error('Revision changed'));
    const { result } = renderHook(useAutomationActions);
    await expect(result.current.pause(event)).rejects.toThrow('Revision changed');
    expect(boundary.updateTaskStatus).not.toHaveBeenCalled();
  });

  it('routes a mixed resume batch to readiness before changing any selected automation', async () => {
    const { result } = renderHook(useAutomationActions);
    const timer = { automationMode: 'schedule' as const, identifier: 'T-2' };
    await act(async () =>
      expect(await result.current.batch('resume', [timer, event])).toBe('settings'),
    );
    expect(boundary.navigate).toHaveBeenCalledWith('/automations/T-1?tab=settings');
    expect(boundary.updateTaskStatus).not.toHaveBeenCalled();
    expect(boundary.enable).not.toHaveBeenCalled();
  });

  it('keeps timer status actions working through the existing Task lifecycle', async () => {
    const { result } = renderHook(useAutomationActions);
    const timer = { automationMode: 'schedule' as const, identifier: 'T-2' };
    await act(async () => result.current.pause(timer));
    await act(async () => result.current.resume(timer));
    expect(boundary.updateTaskStatus.mock.calls).toEqual([
      ['T-2', 'paused'],
      ['T-2', 'scheduled'],
    ]);
    expect(boundary.pause).not.toHaveBeenCalled();
  });
});
