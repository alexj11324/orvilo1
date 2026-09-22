/** @vitest-environment happy-dom */
import { Icon } from '@lobehub/ui';
import type { TaskStatus, TaskWorkflowCategory } from '@orvilo/types';
import { cleanup, render, screen } from '@testing-library/react';
import { cssVar } from 'antd-style';
import type { LucideIcon } from 'lucide-react';
import { CircleDashed, CircleDot, Loader2 } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import TaskStatusIcon from '@/features/AgentTasks/features/TaskStatusIcon';

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

/**
 * Glyph geometry only — the `<svg>`'s own width/height/style differ by surface
 * (the badge draws at 12px, `TaskStatusIcon` at 16), so comparing outerHTML
 * would fail on size while saying nothing about the icon. The children encode
 * the shape: lucide's CircleDot is two `<circle>`s, CircleCheck a path, and so
 * on, all deterministic.
 */
const glyphShape = (root: HTMLElement) => root.querySelector('svg')?.innerHTML ?? null;

const badgeShape = (category: TaskWorkflowCategory) => {
  const { container } = render(
    <TaskWorkflowBadge
      executionStatus={'running'}
      workflowCategory={category}
      workflowStateId={'workflow-state'}
    />,
  );
  return glyphShape(container);
};

const executionStatusShape = (status: TaskStatus) => {
  const { container } = render(<TaskStatusIcon status={status} />);
  return glyphShape(container);
};

const referenceShape = (icon: LucideIcon, color: string) => {
  const { container } = render(<Icon color={color} icon={icon} size={12} />);
  return glyphShape(container);
};

const ALL_CATEGORIES: TaskWorkflowCategory[] = [
  'backlog',
  'canceled',
  'done',
  'in_progress',
  'in_review',
  'todo',
  'triage',
];

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

  /**
   * The defect these pin: this badge used to draw a private glyph per category,
   * reading the wrong convention. `Loader2` + `colorInfo` is this repo's
   * *run-in-progress* visual (`RunIntegrationTag`'s `merging`, `RunVerifyTag`'s
   * `running`), so a task in `in_progress` showed a blue spinner on its card
   * while the column header above it drew the canonical amber circle dot for
   * the same task — the same failure shape as the project-status maps that
   * disagreed on seven of eight statuses.
   *
   * The assertion is *equality between the two rendered surfaces*, never a
   * glyph name: either side moving turns this red without the test having to
   * know which one is right.
   */
  describe('draws the same glyph as the execution-status surfaces', () => {
    it.each([
      ['in_progress', 'running'],
      ['backlog', 'backlog'],
      ['done', 'completed'],
      ['canceled', 'canceled'],
      ['in_review', 'paused'],
    ] as const)('%s === %s', (category, status) => {
      // Both sides asserted non-null first: an equality test between two
      // `null`s passes, so without this the whole block could go green while
      // rendering nothing.
      expect(badgeShape(category)).not.toBeNull();
      expect(executionStatusShape(status)).not.toBeNull();
      expect(badgeShape(category)).toBe(executionStatusShape(status));
    });

    /**
     * The regression itself, stated as a falsification: this asserts the shapes
     * are non-null AND that the badge no longer draws the `Loader2` it shipped
     * with. Without it, the equality block above could pass on a component that
     * renders no glyph at all.
     */
    it('in_progress no longer draws the Loader2 it used to', () => {
      const loader = referenceShape(Loader2, cssVar.colorInfo);

      expect(loader).not.toBeNull();
      expect(badgeShape('in_progress')).not.toBe(loader);
    });
  });

  describe('categories with no canonical counterpart', () => {
    /**
     * `todo` and `triage` have none, so these are deliberate **pins**, not
     * parity checks: they state the two glyphs that are still this file's own,
     * so changing one has to be a conscious edit. `todo` additionally diverges
     * from Cordy, which tints it `sky-500` — a literal palette step with no
     * semantic token here.
     *
     * If a ruling later gives either a home in the canonical map, replace its
     * pin with an equality assertion against that entry.
     */
    it('todo is pinned, and recorded as a divergence from Cordy', () => {
      expect(badgeShape('todo')).toBe(referenceShape(CircleDot, cssVar.colorTextSecondary));
    });

    it('triage is pinned', () => {
      expect(badgeShape('triage')).toBe(referenceShape(CircleDashed, cssVar.colorTextTertiary));
    });

    /** Every category draws something; a silent null is the failure mode above. */
    it.each(ALL_CATEGORIES)('%s renders a glyph', (category) => {
      expect(badgeShape(category)).not.toBeNull();
    });
  });
});
