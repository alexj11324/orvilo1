/** @vitest-environment happy-dom */
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TaskWorkflowBadge from './TaskWorkflowBadge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { state?: string }) =>
      key === 'taskDetail.workflow.doneDeliveryPending'
        ? `${options?.state} · Delivery pending`
        : key,
  }),
}));

afterEach(cleanup);

describe('TaskWorkflowBadge', () => {
  it('does not invent a business state for a local-only task', () => {
    const { container } = render(
      <TaskWorkflowBadge executionStatus={'running'} workflowCategory={'in_progress'} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('keeps external Done separate from an unverified delivery', () => {
    render(
      <TaskWorkflowBadge
        executionStatus={'paused'}
        workflowCategory={'done'}
        workflowStateId={'linear-state-done'}
      />,
    );

    expect(screen.getByText('taskDetail.workflow.category.done · Delivery pending')).toBeVisible();
    expect(document.querySelector('[data-task-workflow-state="done"]')).toBeInTheDocument();
  });
});
