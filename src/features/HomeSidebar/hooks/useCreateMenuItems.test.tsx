/**
 * @vitest-environment happy-dom
 */
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useCreateMenuItems } from './useCreateMenuItems';

// The Prime-cutover create contract (docs/development/device-execution-contract.md):
//   - 'New Orvilo agent' is ONE CLICK — fixed type:'orvilo', deterministic
//     naming, no LLM call, no purpose field, no Agent Builder.
//   - An idempotency key guards double-clicks.
//   - Origin decides the destination: chat entry → select + blank conversation;
//     settings entry → the new agent's settings without touching chat default.

const mocks = vi.hoisted(() => ({
  createAgent: vi.fn(),
  createGroup: vi.fn(),
  navigate: vi.fn(),
  openNewConversation: vi.fn(),
  canCreate: { current: true },
  refreshAgentList: vi.fn(),
  loadGroups: vi.fn(),
  addGroup: vi.fn(),
  switchToGroup: vi.fn(),
  removeAgent: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('@/features/Conversation/selectAgent', () => ({
  openNewConversation: mocks.openNewConversation,
}));

vi.mock('@/features/ConnectAgent', () => ({
  openConnectAgentModal: vi.fn(),
}));

vi.mock('@/features/HomeSidebar/Body/Agent/ModalProvider', () => ({
  useOptionalAgentModal: () => undefined,
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: mocks.canCreate.current }),
}));

vi.mock('@/components/ChatGroupWizard/templates', () => ({
  useGroupTemplates: () => [],
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: unknown) => unknown) =>
    selector({ createAgent: mocks.createAgent }),
}));

vi.mock('@/store/agentGroup', () => ({
  useAgentGroupStore: (selector: (state: unknown) => unknown) =>
    selector({ createGroup: mocks.createGroup, loadGroups: mocks.loadGroups }),
}));

vi.mock('@/store/home', () => ({
  useHomeStore: (selector: (state: unknown) => unknown) =>
    selector({
      addGroup: mocks.addGroup,
      refreshAgentList: mocks.refreshAgentList,
      switchToGroup: mocks.switchToGroup,
      removeAgent: mocks.removeAgent,
    }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/toast', () => ({
  toast: { error: vi.fn(), success: mocks.toastSuccess },
}));

describe('useCreateMenuItems.createAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createAgent.mockResolvedValue({ agentId: 'agent-9' });
    mocks.refreshAgentList.mockResolvedValue(undefined);
  });

  it('writes the fixed builtin binding, deterministic title and an idempotency key — no purpose', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent();

    expect(mocks.createAgent).toHaveBeenCalledTimes(1);
    const params = mocks.createAgent.mock.calls[0][0];
    expect(params.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(params.config.agencyConfig.heterogeneousProvider).toEqual({ type: 'orvilo' });
    expect(params.config.title).toBe('Orvilo AI');
    expect(params.config.systemRole).toBeUndefined();
    expect(params.config).not.toHaveProperty('purpose');
    expect(params.config).not.toHaveProperty('model');
  });

  it('a fresh clientRequestId per click — the key exists on every call', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent();
    await result.current.createAgent();

    const [a, b] = mocks.createAgent.mock.calls.map(([params]) => params.clientRequestId);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(a).not.toBe(b);
  });

  it('chat origin selects the new agent and opens a blank conversation', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent({ origin: 'chat' });

    expect(mocks.openNewConversation).toHaveBeenCalledWith({ agentId: 'agent-9' });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('settings origin stays in the new agent’s settings without touching chat', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent({ origin: 'settings' });

    expect(mocks.navigate).toHaveBeenCalledWith('/settings/agents/agent-9');
    expect(mocks.openNewConversation).not.toHaveBeenCalled();
  });

  it('announces the create with a delete-undo action', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent();

    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    const [options] = mocks.toastSuccess.mock.calls[0];
    expect(options.title).toBe('agentCreated');
    expect(options.actions).toHaveLength(1);
    options.actions[0].onClick();
    expect(mocks.removeAgent).toHaveBeenCalledWith('agent-9');
  });

  it('forwards groupId and visibility without minting anything extra', async () => {
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent({ groupId: 'g1', visibility: 'private' });

    const params = mocks.createAgent.mock.calls[0][0];
    expect(params.groupId).toBe('g1');
    expect(params.visibility).toBe('private');
    expect(mocks.createGroup).not.toHaveBeenCalled();
  });

  it('creates nothing when the caller lacks create permission', async () => {
    mocks.canCreate.current = false;
    const { result } = renderHook(() => useCreateMenuItems());
    await result.current.createAgent();
    expect(mocks.createAgent).not.toHaveBeenCalled();
    mocks.canCreate.current = true;
  });
});
