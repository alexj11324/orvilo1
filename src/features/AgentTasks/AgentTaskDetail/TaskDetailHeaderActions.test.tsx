/**
 * @vitest-environment happy-dom
 */
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import TaskDetailHeaderActions from './TaskDetailHeaderActions';

interface MenuItem {
  disabled?: boolean;
  key?: string;
  label?: ReactNode;
  type?: string;
}

const mocks = vi.hoisted(() => ({
  activeWorkspaceId: 'ws-1' as string | undefined,
  confirmModal: vi.fn(),
  currentUserId: 'user-1' as string | undefined,
  deleteTask: vi.fn(),
  dropdownItems: [] as MenuItem[],
  isWorkspaceOwner: false,
  messageSuccess: vi.fn(),
  navigate: vi.fn(),
  taskState: {
    activeTaskId: 'T-1' as string | undefined,
    taskDetailMap: {
      'T-1': { visibility: 'private' as 'private' | 'public' },
    } as Record<
      string,
      {
        createdByUserId?: string | null;
        visibility?: 'private' | 'public';
        capabilities?: { canDelete: boolean };
      }
    >,
  },
  transferItems: [
    { key: 'transfer-task', label: 'Move to…' },
    { key: 'copy-task', label: 'Copy to...' },
  ] as MenuItem[],
  updateTaskVisibility: vi.fn(),
}));

vi.mock('@/features/NavPanel/components/SidebarDropdownMenu', () => ({
  default: ({ children, items }: { children?: ReactNode; items: MenuItem[] }) => {
    mocks.dropdownItems = items;
    return <>{children}</>;
  },
}));

vi.mock('@/components/Modal', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  confirmModal: (opts: unknown) => mocks.confirmModal(opts),
}));

vi.mock('antd', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  App: {
    useApp: () => ({
      message: { success: mocks.messageSuccess },
    }),
  },
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => mocks.activeWorkspaceId,
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceSlug', () => ({
  useActiveWorkspaceSlug: () => 'ws-slug',
}));

vi.mock('@/business/client/hooks/useIsWorkspaceOwner', () => ({
  useIsWorkspaceOwner: () => mocks.isWorkspaceOwner,
}));

vi.mock('@/features/VisibilityConfirmContent', () => ({
  default: () => <div />,
}));

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: Record<string, unknown>) => unknown) => selector({}),
}));

vi.mock('@/store/user/selectors', () => ({
  userProfileSelectors: {
    userId: () => mocks.currentUserId,
  },
}));

vi.mock('@/business/client/hooks/useTaskTransferMenuItem', () => ({
  useTaskTransferMenuItem: vi.fn(() => mocks.transferItems),
}));

vi.mock('@/features/Workspace/useWorkspaceAwareNavigate', () => ({
  useWorkspaceAwareNavigate: () => mocks.navigate,
}));

vi.mock('@/hooks/useAppOrigin', () => ({
  useAppOrigin: () => 'https://example.com',
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      ...mocks.taskState,
      deleteTask: mocks.deleteTask,
      updateTaskVisibility: mocks.updateTaskVisibility,
    }),
}));

describe('TaskDetailHeaderActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.dropdownItems = [];
    mocks.taskState.activeTaskId = 'T-1';
    mocks.taskState.taskDetailMap = { 'T-1': { visibility: 'private' } };
    mocks.activeWorkspaceId = 'ws-1';
    mocks.currentUserId = 'user-1';
    mocks.isWorkspaceOwner = false;
  });

  it.each([false, true])('uses the server deletion capability %s', (canDelete) => {
    mocks.taskState.taskDetailMap = { 'T-1': { capabilities: { canDelete } } };
    render(<TaskDetailHeaderActions />);
    expect(mocks.dropdownItems.find((item) => item.key === 'delete')?.disabled).toBe(!canDelete);
  });

  it('includes task transfer and copy actions in the detail menu', () => {
    render(<TaskDetailHeaderActions />);

    expect(mocks.dropdownItems.map((item) => item?.key)).toContain('transfer-task');
    expect(mocks.dropdownItems.map((item) => item?.key)).toContain('copy-task');
  });

  it.each(['private', 'public'] as const)(
    'offers no privacy transition for %s tasks',
    (visibility) => {
      mocks.taskState.taskDetailMap = {
        'T-1': { createdByUserId: 'user-1', visibility },
      };
      render(<TaskDetailHeaderActions />);

      const keys = mocks.dropdownItems.map((item) => item?.key);
      expect(keys).not.toContain('publishToWorkspace');
      expect(keys).not.toContain('makePrivate');
      expect(keys).toEqual(
        expect.arrayContaining(['copyId', 'copyLink', 'transfer-task', 'copy-task', 'delete']),
      );
      expect(mocks.updateTaskVisibility).not.toHaveBeenCalled();
    },
  );
});
