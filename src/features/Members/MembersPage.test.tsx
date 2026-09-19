import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import type {
  WorkspaceAgentSummary,
  WorkspaceInvitationSummary,
  WorkspaceMemberSummary,
} from '../Teammates/api/contract';
import MembersPage from './MembersPage';

const member: WorkspaceMemberSummary = {
  joinedAt: '2024-01-02T00:00:00.000Z',
  role: 'admin',
  user: {
    avatar: null,
    email: 'ada@example.com',
    fullName: 'Ada Lovelace',
    username: 'ada',
  },
  userId: 'user-1',
};

const agent: WorkspaceAgentSummary = {
  id: 'agent-1',
  name: 'Scout',
  status: 'active',
};

const invitation: WorkspaceInvitationSummary = {
  createdAt: '2024-02-01T00:00:00.000Z',
  email: 'grace@example.com',
  expiresAt: '2024-03-01T00:00:00.000Z',
  id: 'inv-1',
  inviter: { avatar: null, id: 'user-1', name: 'Ada Lovelace' },
  projects: [],
  role: 'member',
  status: 'pending',
};

vi.mock('@/business/client/hooks/useActiveWorkspace', () => ({
  useActiveWorkspace: () => ({ id: 'ws-1', slug: 'ws' }),
}));
vi.mock('@/business/client/hooks/useWorkspaceCapabilities', () => ({
  useWorkspaceCapabilities: () => ({ canInvite: true, canManageMembers: true }),
}));
// Base UI popup triggers reject shared elements in jsdom; the directory
// semantics under test don't depend on popovers/menus mounting. Button and
// Switch keep the native stubs installed by tests/setup.ts.
vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Tooltip: ({ children }: { children?: ReactNode }) => children,
  TooltipGroup: ({ children }: { children?: ReactNode }) => children,
}));
vi.mock('@lobehub/ui/base-ui', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;

  return {
    ...actual,
    Button: ({ children, icon, ...rest }: { children?: ReactNode; icon?: ReactNode }) => (
      <button type="button" {...rest}>
        {icon}
        {children}
      </button>
    ),
    DropdownMenu: ({ children }: { children?: ReactNode }) => children,
    Popover: ({ children, content }: { children?: ReactNode; content?: ReactNode }) => (
      <>
        {children}
        {content}
      </>
    ),
    Tooltip: ({ children }: { children?: ReactNode }) => children,
  };
});
vi.mock('../Teammates', () => ({ openInviteTeammateModal: vi.fn() }));
vi.mock('../Teammates/api/hooks', () => ({
  useTeammateActions: () => ({
    resendInvitation: vi.fn(),
    revokeInvitation: vi.fn(),
  }),
  useWorkspaceAgentsQuery: () => ({ data: [agent], error: undefined, isLoading: false }),
  useWorkspaceInvitationsQuery: () => ({
    data: [invitation],
    error: undefined,
    isLoading: false,
  }),
  useWorkspaceMembersQuery: () => ({
    error: undefined,
    isLoading: false,
    members: [member],
  }),
}));

const renderPage = () =>
  render(
    <MemoryRouter>
      <MembersPage />
    </MemoryRouter>,
  );

describe('MembersPage directory', () => {
  it('keeps one column meaning across every row kind (UI01)', () => {
    renderPage();

    // One table per directory group, all sharing the same column set.
    const tables = screen.getAllByRole('table');
    expect(tables).toHaveLength(3);
    for (const table of tables) {
      for (const column of [
        'members.column.name',
        'members.column.status',
        'members.column.joined',
        'members.column.teams',
        'members.column.lastSeen',
      ]) {
        expect(within(table).getByText(column)).toBeInTheDocument();
      }
    }

    // Execution agents are labeled as agents, never as applications.
    expect(screen.getAllByText('members.groupAgents').length).toBeGreaterThan(0);
    expect(screen.queryByText(/application/i)).not.toBeInTheDocument();

    // No fake "Online" presence — unknown fields read `—`: `—` Joined for
    // the agent and invitation rows, `—` Teams and `—` Last seen for all
    // three rows.
    expect(screen.queryByText('Online')).not.toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(8);

    // Pending invitations read as invited, not as a fake member status.
    expect(screen.getByText('members.statusPending')).toBeInTheDocument();
    expect(screen.getAllByText('members.statusActive')).toHaveLength(2);
  });

  it('shows the empty state when the search leaves no rows', () => {
    renderPage();

    fireEvent.change(screen.getByPlaceholderText('members.searchPlaceholder'), {
      target: { value: 'nobody-matches-this' },
    });

    expect(screen.getByText('members.emptySearch')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
