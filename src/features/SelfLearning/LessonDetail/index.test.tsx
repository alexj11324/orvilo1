import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import LessonDetail from './index';

const mocks = vi.hoisted(() => ({
  lesson: { data: undefined as unknown, error: undefined, isLoading: false, mutate: vi.fn() },
}));

vi.mock('../hooks', () => ({
  useExpertiseDomain: () => ({ data: undefined, error: undefined, mutate: vi.fn() }),
  useExpertiseLesson: () => mocks.lesson,
}));

vi.mock('@/store/agent', () => ({
  useAgentStore: (selector: (state: unknown) => unknown) => selector({ activeAgentId: 'agt_1' }),
}));

vi.mock('react-router', () => ({
  Link: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  useParams: () => ({ domainId: 'dom_1', lessonId: 'les_1' }),
}));

vi.mock('@/features/NavHeader', () => ({
  default: ({ left }: { left?: ReactNode }) => <div>{left}</div>,
}));

vi.mock('@/features/AgentBreadcrumb', () => ({ default: () => null }));
vi.mock('@/features/WideScreenContainer', () => ({
  default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/Loading/BrandTextLoading', () => ({ default: () => null }));

const lesson = (overrides: Record<string, unknown> = {}) => ({
  hits: [],
  lesson: {
    code: 'P-01',
    currentRevision: 1,
    hitCount: 2,
    hitRunCount: 1,
    id: 'les_1',
    layer: undefined,
    sections: [{ body: '先看调用方', key: 'rule' }],
    status: 'active',
    title: '先看调用方',
    updatedAt: new Date('2026-09-01T00:00:00Z'),
    ...overrides,
  },
});

beforeEach(() => {
  mocks.lesson = { data: lesson(), error: undefined, isLoading: false, mutate: vi.fn() };
});

afterEach(cleanup);

describe('rule detail metadata', () => {
  // A rule reached by an old link can be one the agent no longer follows; the list only ever
  // shows active rules, so saying nothing here would present a retired rule as a live one.
  it('flags a rule that is no longer in use', () => {
    mocks.lesson.data = lesson({ status: 'retired' });

    render(<LessonDetail />);

    expect(screen.getByText('rules.detail.status.retired')).toBeInTheDocument();
  });

  it('says nothing about the status of a rule that is in use', () => {
    render(<LessonDetail />);

    expect(screen.queryByText('rules.detail.status.active')).not.toBeInTheDocument();
    expect(screen.queryByText('rules.detail.status.retired')).not.toBeInTheDocument();
  });

  // The revision is read off the row, so an un-revised rule must not claim a version it has not
  // earned — S60 forbids inventing one.
  it('shows a version only once the rule has actually been revised', () => {
    render(<LessonDetail />);
    expect(screen.queryByText('rules.detail.revision')).not.toBeInTheDocument();

    cleanup();
    mocks.lesson.data = lesson({ currentRevision: 4 });
    render(<LessonDetail />);

    expect(screen.getByText('rules.detail.revision')).toBeInTheDocument();
  });

  it('always reports when the rule last changed', () => {
    render(<LessonDetail />);

    expect(screen.getByText('rules.detail.updatedAt')).toBeInTheDocument();
  });
});
