/**
 * @vitest-environment happy-dom
 */
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import TaskVisibilityTag from './TaskVisibilityTag';

vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children }: { children: ReactNode }) => <>{children}</>,
  DropdownMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ render: trigger }: { render: ReactNode }) => <>{trigger}</>,
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'workspace-1',
}));

vi.mock('@/hooks/usePermission', () => ({
  usePermission: () => ({ allowed: true, reason: '' }),
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ updateTaskVisibility: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, options?: { defaultValue?: string }) => options?.defaultValue,
  }),
}));

describe('TaskVisibilityTag', () => {
  it('shows only the current checkmark without unsupported numeric shortcut hints', () => {
    render(
      <TaskVisibilityTag visibility="private">
        <span>Visibility</span>
      </TaskVisibilityTag>,
    );

    const privateRow = screen.getByText('Private').closest('div');
    const publicRow = screen.getByText('Workspace').closest('div');

    expect(privateRow).not.toBeNull();
    expect(publicRow).not.toBeNull();
    expect(privateRow!.querySelector('.lucide-check')).toBeInTheDocument();
    expect(publicRow!.querySelector('.lucide-check')).not.toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
    expect(screen.queryByText('2')).not.toBeInTheDocument();
  });
});
