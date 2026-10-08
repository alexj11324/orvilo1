import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';

import { GroupProfile } from './index';

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  refresh: vi.fn(),
  updateGroup: vi.fn(),
  group: {
    id: 'group-one',
    title: 'Group',
    content: 'Existing description',
    supervisorAgentId: 'member-a',
    visibility: 'private',
    agents: [
      {
        id: 'member-a',
        name: 'Coordinator',
        heterogeneousType: 'codex',
        isSupervisor: true,
        agencyConfig: { heterogeneousProvider: { type: 'codex' } },
      },
      {
        id: 'member-b',
        name: 'Researcher',
        heterogeneousType: 'opencode',
        isSupervisor: false,
        agencyConfig: { heterogeneousProvider: { type: 'opencode' } },
      },
    ],
  },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('react-router', () => ({ useParams: () => ({ gid: 'group-one' }) }));
vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => vi.fn(),
}));
vi.mock('@/features/ResourcePermission/ResourceConfigAccessGate', () => ({
  default: ({ children }: { children: ReactNode }) => children,
}));
vi.mock('@/components/AgentRuntimeIcon', () => ({
  default: ({ type }: { type?: string }) => <span aria-label={type} />,
}));
vi.mock('@/components/Skeleton/Profile', () => ({ default: () => null }));
vi.mock('@/components/Modal', () => ({ confirmModal: vi.fn() }));
vi.mock('@/routes/(main)/group/profile/StoreSync', () => ({ default: () => null }));
vi.mock('@/business/client/hooks/useHasActiveWorkspace', () => ({
  useHasActiveWorkspace: () => false,
}));
vi.mock('@/business/client/hooks/useAgentGroupTransferMenuItem', () => ({
  useAgentGroupTransferMenuItem: () => [],
}));
vi.mock('@/business/client/hooks/useAgentGroupTransferToMemberMenuItem', () => ({
  useAgentGroupTransferToMemberMenuItem: () => null,
}));
vi.mock('@/features/ResourcePermission/useResourceAccess', () => ({
  useResourceAccess: () => ({ canEditResource: true }),
}));
vi.mock('@/hooks/usePermission', () => ({ usePermission: () => ({ allowed: true }) }));
vi.mock('@/features/EditLock', () => ({
  EditingIndicator: () => null,
  useEditLock: () => ({ lockedByOther: false, pending: false, health: 'healthy' }),
}));
vi.mock('@/store/groupProfile', () => ({
  useGroupProfileStore: (select: (state: unknown) => unknown) =>
    select({ agentBuilderContentUpdate: null, setAgentBuilderContent: vi.fn() }),
}));
vi.mock('@/routes/(main)/group/_layout/Sidebar/AddGroupMemberModal', () => ({
  default: () => null,
}));
vi.mock('@/services/chatGroup', () => ({ chatGroupService: { updateAgentInGroup: mocks.update } }));
vi.mock('@/store/agentGroup/selectors', () => ({
  agentGroupSelectors: { getGroupById: () => () => mocks.group },
}));
vi.mock('@/store/agentGroup', () => ({
  useAgentGroupStore: Object.assign(
    (select: (state: unknown) => unknown) => select({ updateGroup: mocks.updateGroup }),
    {
      getState: () => ({ refreshGroupDetail: mocks.refresh }),
    },
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.update.mockResolvedValue(undefined);
  mocks.refresh.mockResolvedValue(undefined);
});

it('shows all members with an inline coordinator badge and selects the same existing member ID', async () => {
  render(<GroupProfile />);
  expect(screen.getByRole('button', { name: 'Coordinator' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Researcher' })).toBeTruthy();
  expect(screen.getByLabelText('codex')).toBeTruthy();
  expect(screen.getByLabelText('opencode')).toBeTruthy();
  expect(screen.getByText('group.settings.coordinatorName')).toBeTruthy();
  expect(screen.queryByRole('tab')).toBeNull();
  expect(screen.queryByText('group.settings.model')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'group.settings.setCoordinator' }));
  await waitFor(() =>
    expect(mocks.update).toHaveBeenCalledWith('group-one', 'member-b', { role: 'supervisor' }),
  );
  expect(mocks.refresh).toHaveBeenCalledWith('group-one');
});

it('shows an explicit repair instruction when the Group has no coordinator', () => {
  const previous = mocks.group.supervisorAgentId;
  mocks.group.supervisorAgentId = '';
  try {
    render(<GroupProfile />);
    expect(screen.getByRole('status').textContent).toBe('group.settings.chooseCoordinator');
  } finally {
    mocks.group.supervisorAgentId = previous;
  }
});

it('mounts only Description settings and persists content without rewriting title or visibility', async () => {
  render(<GroupProfile />);
  expect(screen.queryByRole('textbox', { name: 'group.create.name' })).toBeNull();
  expect(screen.queryByRole('combobox')).toBeNull();
  expect(screen.getAllByRole('textbox')).toHaveLength(1);
  expect(document.querySelector('form [aria-haspopup]')).toBeNull();
  const description = screen.getByRole('textbox', { name: 'group.settings.description' });
  expect(description).toHaveValue('Existing description');
  fireEvent.change(description, { target: { value: 'Edited description' } });
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  await waitFor(() =>
    expect(mocks.updateGroup).toHaveBeenCalledExactlyOnceWith('group-one', {
      content: 'Edited description',
      editorData: {},
    }),
  );
  expect(mocks.group.title).toBe('Group');
  expect(mocks.group.visibility).toBe('private');
});
