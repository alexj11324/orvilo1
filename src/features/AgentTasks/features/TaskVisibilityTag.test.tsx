/**
 * @vitest-environment happy-dom
 */
import { render } from '@testing-library/react';
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
  it.each(['private', 'public'] as const)(
    'offers no task privacy control for %s tasks',
    (visibility) => {
      const { container } = render(
        <TaskVisibilityTag taskIdentifier="T-1" visibility={visibility}>
          <span>Visibility</span>
        </TaskVisibilityTag>,
      );

      expect(container).toBeEmptyDOMElement();
    },
  );
});
