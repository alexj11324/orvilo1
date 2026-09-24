/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';

import TeamTriageRow from './TeamTriageRow';

const renderedIcons = vi.hoisted(() => [] as unknown[]);

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ i18n: { language: 'en-US' }, t: (key: string) => key }),
}));

vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Icon: ({ icon }: { icon: unknown }) => {
    renderedIcons.push(icon);
    return <span data-testid="workflow-icon" />;
  },
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

vi.mock('@/features/AgentTasks/features/TaskStatusIcon', () => ({
  default: ({ status }: { status: string }) => <span data-testid="execution-icon">{status}</span>,
}));

vi.mock('@/features/Workspace/WorkspaceLink', () => ({
  default: ({ children }: { children: ReactNode }) => <a href="/task">{children}</a>,
}));

afterEach(() => {
  cleanup();
  renderedIcons.length = 0;
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

    expect(screen.getByTestId('workflow-icon')).toBeInTheDocument();
    expect(renderedIcons).toContain(WORKFLOW_CATEGORY_VISUALS.in_progress.icon);
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
    expect(screen.queryByTestId('workflow-icon')).not.toBeInTheDocument();
  });
});
