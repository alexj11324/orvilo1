/**
 * @vitest-environment happy-dom
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import TaskListVisibilityFilter from './TaskListVisibilityFilter';

const taskStoreMock = vi.hoisted(() => ({
  setListVisibility: vi.fn(),
  visibility: 'workspace',
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'workspace-1',
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      listVisibility: taskStoreMock.visibility,
      setListVisibility: taskStoreMock.setListVisibility,
    }),
}));

const itemsByText = async () => {
  const items = await screen.findAllByRole('menuitem');
  const byText = (needle: string) => items.find((item) => item.textContent?.includes(needle));
  return {
    all: byText('taskList.visibility.all'),
    private: byText('createTask.visibility.private'),
    workspace: byText('createTask.visibility.workspace'),
  };
};

describe('TaskListVisibilityFilter', () => {
  it('shows a trailing checkmark only for the active visibility option', async () => {
    render(<TaskListVisibilityFilter />);
    fireEvent.click(screen.getByRole('button'));

    const { all, private: privateItem, workspace } = await itemsByText();
    expect(workspace?.querySelector('svg.lucide-check')).not.toBeNull();
    expect(privateItem?.querySelector('svg.lucide-check')).toBeNull();
    expect(all?.querySelector('svg.lucide-check')).toBeNull();
  });
});
