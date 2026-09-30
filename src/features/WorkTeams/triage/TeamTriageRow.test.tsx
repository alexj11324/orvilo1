/**
 * @vitest-environment happy-dom
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TeamTriageRow from './TeamTriageRow';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en-US' }, t: (key: string) => key }),
}));

vi.mock('@/features/AgentTasks/features/TaskStatusIcon', () => ({
  default: ({ status }: { status: string }) => <span data-testid="execution-icon">{status}</span>,
}));

vi.mock('@/features/Workspace/WorkspaceLink', () => ({
  default: ({ children }: { children: ReactNode }) => <a href="/task">{children}</a>,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const props = {
  destinations: [],
  memberOptions: [],
  onAction: vi.fn(),
  onPickDuplicate: vi.fn(),
  onReassign: vi.fn(),
  onTransferred: vi.fn(),
};

describe('TeamTriageRow status icon', () => {
  it('uses the board workflow glyph for a linked in-progress task', () => {
    render(
      <TeamTriageRow
        {...props}
        task={{
          id: 'task-1',
          name: 'Linked issue',
          status: 'backlog',
          workflowCategory: 'in_progress',
          workflowStateId: 'linear-state-progress',
        }}
      />,
    );

    expect(
      screen.getByRole('link').querySelector('[data-workflow-icon="in_progress"]'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('execution-icon')).not.toBeInTheDocument();
  });

  it('keeps the execution icon when no provider workflow state is linked', () => {
    render(
      <TeamTriageRow
        {...props}
        task={{ id: 'task-2', name: 'Local issue', status: 'backlog', workflowCategory: 'todo' }}
      />,
    );

    expect(screen.getByTestId('execution-icon')).toHaveTextContent('backlog');
    expect(screen.getByRole('link').querySelector('[data-workflow-icon]')).toBeNull();
  });
  it('keeps accept and decline actions and explains disabled snooze', () => {
    render(
      <TeamTriageRow {...props} task={{ id: 'task-3', name: 'Local issue', status: 'backlog' }} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'teams.accept' }));
    fireEvent.click(screen.getByRole('button', { name: 'teams.decline' }));
    expect(props.onAction.mock.calls).toEqual([['accept'], ['decline']]);
    expect(screen.getByRole('button', { name: 'teams.snooze' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'teams.snooze' })).toHaveAttribute(
      'title',
      'teams.snoozeUnavailable',
    );
  });
});
