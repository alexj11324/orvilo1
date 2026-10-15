/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TaskActivities from './TaskActivities';
import { TaskDetailScope } from './TaskDetailScope';

const mocks = vi.hoisted(() => ({
  hash: '',
  refreshTaskDetail: vi.fn(),
  scrollIntoView: vi.fn(),
  state: {
    activeTaskId: 'T-1',
    taskDetailMap: {} as Record<string, Record<string, unknown>>,
  },
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock('react-router', () => ({
  useLocation: () => ({ hash: mocks.hash, search: '' }),
}));

vi.mock('@/business/client/hooks/useActiveWorkspaceId', () => ({
  useActiveWorkspaceId: () => 'ws-1',
}));

vi.mock('@/store/task', () => {
  const state = () => ({
    ...mocks.state,
    internal_refreshTaskDetail: mocks.refreshTaskDetail,
  });
  const useTaskStore = (selector: (value: unknown) => unknown) => selector(state());
  useTaskStore.getState = state;
  return { useTaskStore };
});

vi.mock('@/store/user', () => ({
  useUserStore: (selector: (state: unknown) => unknown) =>
    selector({ user: { fullName: 'Viewer' } }),
}));

vi.mock('@/hooks/useUserAvatar', () => ({ useUserAvatar: () => 'viewer.png' }));

vi.mock('@/services/workAttention', () => ({
  workAttentionService: { subscribe: mocks.subscribe, unsubscribe: mocks.unsubscribe },
}));

vi.mock('@/components/toast', () => ({ toast: { error: vi.fn() } }));

// Heavy feed children are stubbed to markers; the section chrome under test —
// header, rail lines, time format, composer seat — renders for real.
vi.mock('./CommentInput', () => ({
  default: ({ replyTarget }: { replyTarget?: { commentId: string } | null }) => (
    <div data-reply-to={replyTarget?.commentId ?? ''} data-testid="comment-input" />
  ),
}));
vi.mock('./CommentCard', () => ({
  default: ({
    activity,
    onReply,
    replies,
  }: {
    activity: { id?: string };
    onReply?: (activity: { id?: string }) => void;
    replies?: { id?: string }[];
  }) => (
    <div
      data-comment-id={activity.id}
      data-testid="comment-card"
      id={activity.id ? `comment-${activity.id}` : undefined}
    >
      {onReply ? (
        <button
          data-testid={`reply-btn-${activity.id}`}
          type="button"
          onClick={() => onReply(activity)}
        >
          reply
        </button>
      ) : null}
      {(replies ?? []).map((reply) => (
        <div data-testid={`reply-${reply.id}`} key={reply.id} />
      ))}
    </div>
  ),
}));
vi.mock('./TopicCard', () => ({ default: () => <div data-testid="topic-card" /> }));
vi.mock('./TaskBriefCard', () => ({ default: () => <div data-testid="brief-card" /> }));
vi.mock('./TaskRunReport', () => ({ default: () => <div data-testid="run-report" /> }));
vi.mock('./PropertyChangeSentence', () => ({ default: () => <span>change</span> }));
vi.mock('../features/AssigneeAvatar', () => ({ default: () => <span /> }));
vi.mock('../features/TaskPriorityTag', () => ({ PRIORITY_META: {} }));
vi.mock('@/features/AgentProfileCard/AgentProfilePopup', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/features/AgentTasks/shared/LinearTaskSyncStatus', () => ({
  default: () => null,
  LinearTaskSyncProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const setDetail = (detail: Record<string, unknown>) => {
  mocks.state.taskDetailMap = {
    'T-1': { id: 'task-uuid-1', identifier: 'T-1', ...detail },
  };
};

const renderFeed = () =>
  render(
    <TaskDetailScope taskId="T-1">
      <TaskActivities />
    </TaskDetailScope>,
  );

/** The section header's root band: toggle on the left, actions on the right. */
const headerBand = () =>
  screen.getByRole('button', { name: 'taskDetail.activities' }).closest('.justify-between')!;

describe('TaskActivities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash = '';
    setDetail({ isSubscribed: false });
    // happy-dom has no layout — stub the scroll seam the deep-link path uses.
    Element.prototype.scrollIntoView = mocks.scrollIntoView;
  });
  afterEach(cleanup);

  it('seats the subscribe control in the section header, right of the title', () => {
    renderFeed();

    const band = headerBand();
    expect(band).not.toBeNull();
    const subscribe = within(band as HTMLElement).getByRole('button', {
      name: 'myWork.subscribe',
    });
    // The right cluster — the control follows the heading toggle in DOM order.
    const toggle = within(band as HTMLElement).getByRole('button', {
      name: 'taskDetail.activities',
    });
    expect(
      toggle.compareDocumentPosition(subscribe) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('shows no feed filter chips on this surface', () => {
    renderFeed();

    expect(screen.queryByRole('button', { name: 'taskDetail.activities.filter.all' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'taskDetail.activities.filter.label' })).toBeNull();
    expect(screen.queryByText('taskDetail.activities.filter.updates')).toBeNull();
  });

  it('prints feed times as relative even months back, never absolute dates', () => {
    setDetail({
      activities: [
        { id: 'a1', time: '2000-01-01T00:00:00Z', type: 'created' },
        { content: 'hi', id: 'c1', time: '2001-06-01T00:00:00Z', type: 'comment' },
      ],
    });
    renderFeed();

    const band = headerBand();
    const section = band.parentElement!;
    // A 2000 timestamp is "…ago" under the feed preset — never "2000/01/01".
    expect(section.textContent).toMatch(/ago/);
    expect(section.textContent).not.toMatch(/2000\//);
  });

  it('seats the comment composer at the bottom of the feed, after the last entry', () => {
    setDetail({
      activities: [
        { id: 'a1', time: '2026-04-01T00:00:00Z', type: 'created' },
        { content: 'hi', id: 'c1', time: '2026-05-01T00:00:00Z', type: 'comment' },
      ],
    });
    const { container } = renderFeed();

    const composer = screen.getByTestId('comment-input');
    const card = screen.getByTestId('comment-card');
    const created = screen.getByText('taskDetail.activities.fallback.created');
    // Oldest first, matching Linear: the created line, then the later comment,
    // then the composer under the latest entry.
    expect(created.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(card.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const rail = container.querySelector('.before\\:bg-divider');
    expect(rail).not.toBeNull();
    expect(rail!.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('nests a comment reply inside its parent card instead of a flat row', () => {
    setDetail({
      activities: [
        { content: 'root', id: 'c1', time: '2026-05-01T00:00:00Z', type: 'comment' },
        {
          content: 'reply',
          id: 'c2',
          parentCommentId: 'c1',
          time: '2026-05-02T00:00:00Z',
          type: 'comment',
        },
        { content: 'other', id: 'c3', time: '2026-05-03T00:00:00Z', type: 'comment' },
      ],
    });
    renderFeed();

    // Two top-level cards only — the reply renders nested inside its parent.
    expect(screen.getAllByTestId('comment-card')).toHaveLength(2);
    const parent = document.querySelector('[data-comment-id="c1"]')!;
    expect(within(parent as HTMLElement).getByTestId('reply-c2')).toBeTruthy();
    expect(document.querySelector('[data-comment-id="c3"]')).not.toBeNull();
  });

  it('keeps the empty state ahead of the composer when the feed has nothing', () => {
    renderFeed();

    expect(screen.getByText('taskDetail.activitiesEmpty')).toBeTruthy();
    const composer = screen.getByTestId('comment-input');
    const empty = screen.getByText('taskDetail.activitiesEmpty');
    expect(empty.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('expands a folded feed for a comment deep link and scrolls after it opens', () => {
    setDetail({
      activities: [{ content: 'hi', id: 'c1', time: '2026-05-01T00:00:00Z', type: 'comment' }],
    });
    const { rerender } = renderFeed();
    const toggle = screen.getByRole('button', { name: 'taskDetail.activities' });

    // Fold the feed away, then arrive at the comment link: the card's own
    // scroll ran while the panel was still hidden — a no-op.
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    mocks.hash = '#comment-c1';
    rerender(
      <TaskDetailScope taskId="T-1">
        <TaskActivities />
      </TaskDetailScope>,
    );

    // The section reopened and the linked card's scroll re-fired once visible.
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(mocks.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(mocks.scrollIntoView.mock.instances[0]).toBe(document.getElementById('comment-c1'));
  });

  it('clears the reply chip when the feed rebinds to another issue', () => {
    setDetail({
      activities: [{ content: 'hi', id: 'c1', time: '2026-05-01T00:00:00Z', type: 'comment' }],
    });
    const { rerender } = renderFeed();

    fireEvent.click(screen.getByTestId('reply-btn-c1'));
    expect(screen.getByTestId('comment-input')).toHaveAttribute('data-reply-to', 'c1');

    // The same feed host is re-bound to a different issue — the chip must not
    // aim the new issue's composer at the previous issue's comment.
    rerender(
      <TaskDetailScope taskId="T-2">
        <TaskActivities />
      </TaskDetailScope>,
    );

    expect(screen.getByTestId('comment-input')).toHaveAttribute('data-reply-to', '');
  });
});
