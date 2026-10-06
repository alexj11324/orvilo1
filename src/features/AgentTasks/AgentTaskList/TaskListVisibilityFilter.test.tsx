/**
 * @vitest-environment happy-dom
 */
import { render } from '@testing-library/react';
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

describe('TaskListVisibilityFilter', () => {
  it.each(['private', 'workspace', 'all'])(
    'offers no privacy filter with old state %s',
    (visibility) => {
      taskStoreMock.visibility = visibility;
      const { container } = render(<TaskListVisibilityFilter />);

      expect(container).toBeEmptyDOMElement();
      expect(taskStoreMock.setListVisibility).not.toHaveBeenCalled();
    },
  );
});
