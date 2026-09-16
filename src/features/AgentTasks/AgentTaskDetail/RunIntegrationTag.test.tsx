/**
 * @vitest-environment happy-dom
 */
import type { TaskTopicIntegration } from '@orvilo/types';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import RunIntegrationTag from './RunIntegrationTag';

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

  it('renders nothing for a run with no integration record', () => {
    const { container } = render(<RunIntegrationTag integration={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['pending', 'merging', 'conflict', 'blocked', 'integrated', 'skipped'] as const)(
    'labels the %s state',
    (state) => {
      render(<RunIntegrationTag integration={record({ state })} />);
      expect(screen.getByText(state)).toBeInTheDocument();
    },
  );

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
});
