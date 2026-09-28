/** @vitest-environment happy-dom */
import { Icon } from '@lobehub/ui';
import type { TaskWorkflowCategory } from '@orvilo/types';
import { cleanup, render, screen } from '@testing-library/react';
import { cssVar } from 'antd-style';
import { Loader2 } from 'lucide-react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type StatusVisual, WORKFLOW_CATEGORY_VISUALS } from '@/components/ExecutionStatus';

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
// Mask ids are per-instance (`useId`) by design, so two renders of the same
// glyph differ only there; normalise them so the comparison stays on shape.
const glyphShape = (root: HTMLElement) =>
  root.querySelector('svg')?.innerHTML.replaceAll(/wf-knockout-[\w-]+/g, 'wf-knockout') ?? null;

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

const referenceShape = (icon: StatusVisual['icon'], color: string) => {
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
   * The canonical contract: the badge draws `WORKFLOW_CATEGORY_VISUALS` — the
   * same map the `wf:` kanban columns and workflow-category group headers
   * read — so a card can never disagree with the column above it. The
   * assertion is *equality between the rendered badge and the canonical map
   * entry*, never a glyph name: moving the map turns this red without the
   * test having to know which glyph is right.
   */
  describe('draws the canonical workflow-category glyph', () => {
    it.each(ALL_CATEGORIES)('%s renders WORKFLOW_CATEGORY_VISUALS', (category) => {
      const visual = WORKFLOW_CATEGORY_VISUALS[category];

      // Non-null asserted first: an equality test between two `null`s passes,
      // so without this the whole block could go green while rendering nothing.
      expect(badgeShape(category)).not.toBeNull();
      expect(badgeShape(category)).toBe(referenceShape(visual.icon, visual.color));
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

  /**
   * Terminal marks knock their check / cross out with a mask rather than a
   * path painted in a surface token — the glyph sits on rows, elevated board
   * cards and translucent hover fills, and only a real hole reads on all.
   */
  describe('terminal knockouts', () => {
    it('cuts the done check out with a per-instance mask', () => {
      const { icon: Done } = WORKFLOW_CATEGORY_VISUALS.done;
      const { container } = render(
        <>
          <Icon color={'#5e6ad2'} icon={Done} size={14} />
          <Icon color={'#5e6ad2'} icon={Done} size={14} />
        </>,
      );

      const masks = [...container.querySelectorAll('mask')];
      expect(masks).toHaveLength(2);
      expect(new Set(masks.map((mask) => mask.id)).size).toBe(2);
      expect(container.querySelector(`[mask="url(#${masks[0].id})"]`)).not.toBeNull();
      // Every painted stroke is the icon color; nothing guesses a background.
      const strokes = [...container.querySelectorAll('circle')].map((node) =>
        node.getAttribute('stroke'),
      );
      expect(new Set(strokes)).toEqual(new Set(['#5e6ad2']));
    });

    it('draws the progress states without a mask', () => {
      for (const category of ['backlog', 'todo', 'in_progress', 'in_review'] as const) {
        const { container, unmount } = render(
          <Icon icon={WORKFLOW_CATEGORY_VISUALS[category].icon} size={14} />,
        );
        expect(container.querySelector('mask')).toBeNull();
        expect(container.querySelector('svg')).toHaveAttribute('data-workflow-icon', category);
        unmount();
      }
    });
  });
});
