/**
 * @vitest-environment happy-dom
 */
import type { TaskTopicIntegration } from '@orvilo/types';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RunIntegrationTag from './RunIntegrationTag';

const mocks = vi.hoisted(() => ({
  refreshTaskDetail: vi.fn(),
  retryIntegration: vi.fn(),
}));

vi.mock('@lobehub/ui', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  Tooltip: ({ children, title }: { children: ReactNode; title: ReactNode }) => (
    <>
      {children}
      {title}
    </>
  ),
}));

vi.mock('@/services/task', () => ({
  taskService: { retryIntegration: mocks.retryIntegration },
}));

vi.mock('@/store/task', () => ({
  useTaskStore: (selector: (state: any) => unknown) =>
    selector({ internal_refreshTaskDetail: mocks.refreshTaskDetail }),
}));

const record = (overrides: Partial<TaskTopicIntegration> = {}): TaskTopicIntegration => ({
  attempts: 0,
  baseBranch: 'main',
  branch: 'task/T-1',
  role: 'task',
  state: 'pending',
  ...overrides,
});

describe('RunIntegrationTag', () => {
  afterEach(cleanup);
  beforeEach(() => vi.clearAllMocks());

  it('renders nothing for a run with no integration record', () => {
    const { container } = render(<RunIntegrationTag integration={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each([
    'pending',
    'merging',
    'conflict',
    'blocked',
    'publish_failed',
    'verification_pending',
    'integrated',
    'skipped',
  ] as const)('labels the %s state', (state) => {
    render(<RunIntegrationTag integration={record({ state })} />);
    expect(screen.getByText(state)).toBeInTheDocument();
  });

  it('opens the PR link without triggering the row click', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);
    const onRowClick = vi.fn();
    const prUrl = 'https://github.com/acme/widgets/pull/7';

    render(
      <div onClick={onRowClick}>
        <RunIntegrationTag integration={record({ prUrl, state: 'merging' })} />
      </div>,
    );

    fireEvent.click(screen.getByText('merging'));

    expect(open).toHaveBeenCalledWith(prUrl, '_blank', 'noopener,noreferrer');
    expect(onRowClick).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('does not open anything when no PR was recorded', () => {
    const open = vi.fn();
    vi.stubGlobal('open', open);

    render(<RunIntegrationTag integration={record({ state: 'blocked' })} />);
    fireEvent.click(screen.getByText('blocked'));

    expect(open).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('retries a recoverable integration state and refreshes task details', async () => {
    mocks.retryIntegration.mockResolvedValue('hold');
    mocks.refreshTaskDetail.mockResolvedValue(undefined);
    render(
      <RunIntegrationTag
        integration={record({ state: 'publish_failed' })}
        taskId={'task-1'}
        topicId={'topic-1'}
      />,
    );

    fireEvent.click(await screen.findByText('taskDetail.integration.retryPublish'));

    await waitFor(() => {
      expect(mocks.retryIntegration).toHaveBeenCalledWith('task-1', 'topic-1');
      expect(mocks.refreshTaskDetail).toHaveBeenCalledWith('task-1');
    });
  });
});
