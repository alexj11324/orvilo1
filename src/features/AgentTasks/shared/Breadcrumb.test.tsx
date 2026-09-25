/**
 * @vitest-environment happy-dom
 */
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Breadcrumb from './Breadcrumb';

const mocks = vi.hoisted(() => ({
  taskState: {} as any,
}));

const createState = (taskDetailMap: Record<string, any>) => ({
  taskDetailMap,
});

vi.mock('react-router', () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
  useParams: () => ({}),
}));

// Render the workspace-aware link as a plain anchor so the asserted hrefs stay
// the raw task paths (no workspace-slug prefix, no real router context).
vi.mock('@/features/Workspace/WorkspaceLink', () => ({
  default: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

// Agent crumb metadata isn't under test here; the agent store isn't mocked.
vi.mock('./useAgentDisplayMeta', () => ({
  useAgentDisplayMeta: () => undefined,
}));

vi.mock('zustand/react/shallow', () => ({
  useShallow: (selector: any) => selector,
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: any) => selector(mocks.taskState),
}));

vi.mock('./style', () => ({
  styles: { breadcrumb: 'breadcrumb' },
}));

describe('Breadcrumb', () => {
  beforeEach(() => {
    mocks.taskState = createState({
      'T-child': {
        identifier: 'T-child',
        instruction: 'Child instruction',
        name: 'Child task',
        parent: { agentId: 'agt_parent', identifier: 'T-parent', name: 'Parent task' },
        status: 'running',
      },
      'T-parent': {
        agentId: 'agt_parent',
        identifier: 'T-parent',
        instruction: 'Parent instruction',
        name: 'Parent task',
        parent: { agentId: null, identifier: 'T-root', name: 'Root task' },
        status: 'running',
      },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('shows only the owner and the current issue, never ancestor crumbs', () => {
    // Linear renders `project > ISSUE-ID`: the parent lives in the "Sub-issue
    // of" row, not in the trail, so T-parent/T-root must not appear here.
    render(<Breadcrumb taskId="T-child" />);

    expect(screen.getByRole('link', { name: 'taskList.all' })).toHaveAttribute('href', '/tasks');
    expect(screen.getByText('T-child')).toBeTruthy();
    expect(screen.getByText('Child task')).toBeTruthy();
    expect(screen.queryByText('T-parent')).toBeNull();
    expect(screen.queryByText('T-root')).toBeNull();
  });

  it('links the owner crumb when a project is attached to the issue', () => {
    mocks.taskState = createState({
      'T-child': {
        identifier: 'T-child',
        name: 'Child task',
        parent: { agentId: 'agt_parent', identifier: 'T-parent', name: 'Parent task' },
        projectId: 'proj_1',
        status: 'running',
      },
    });

    render(<Breadcrumb taskId="T-child" />);

    // The owner crumb falls back to "Tasks" while the project resolves; the
    // parent still stays out of the trail.
    expect(screen.getByRole('link', { name: 'taskList.all' })).toHaveAttribute('href', '/tasks');
    expect(screen.queryByText('T-parent')).toBeNull();
  });
});
