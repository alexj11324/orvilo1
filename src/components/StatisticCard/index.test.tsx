import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import StatisticCard from './index';

describe('StatisticCard', () => {
  it('renders title and formatted value with prefix, suffix and precision', () => {
    render(
      <StatisticCard
        statistic={{ precision: 2, prefix: '$', suffix: 'k', value: 1234.5 }}
        title="Total Cost"
      />,
    );

    expect(screen.getByText('Total Cost')).toBeInTheDocument();
    expect(screen.getByText('$')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('.50')).toBeInTheDocument();
    expect(screen.getByText('k')).toBeInTheDocument();
  });

  it('renders a custom node title as-is', () => {
    render(
      <StatisticCard statistic={{ value: 1 }} title={<span data-testid="custom-title">Hi</span>} />,
    );

    expect(screen.getByTestId('custom-title')).toHaveTextContent('Hi');
  });

  it('renders description below the value and extra in the header', () => {
    render(
      <StatisticCard
        extra={<button type="button">More</button>}
        statistic={{ description: <span>desc line</span>, value: 10 }}
        title="Tokens"
      />,
    );

    expect(screen.getByText('desc line')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
  });

  it('replaces extra with a small spinner while loading', () => {
    const { container } = render(
      <StatisticCard
        loading
        extra={<button type="button">More</button>}
        statistic={{ value: 10 }}
        title="Tokens"
      />,
    );

    expect(screen.queryByText('More')).toBeNull();
    expect(container.querySelector('[role="status"]')).not.toBeNull();
  });

  it('applies valueStyle to the statistic content', () => {
    const { container } = render(
      <StatisticCard
        statistic={{ value: 10, valueStyle: { color: 'rgb(255, 0, 0)' } }}
        title="Savings"
      />,
    );

    expect(container.querySelector('.ant-statistic-content')).toHaveStyle({
      color: 'rgb(255, 0, 0)',
    });
  });

  it('applies variant and padding styles to the root', () => {
    const { container } = render(
      <StatisticCard
        padding={24}
        paddingBlock={8}
        paddingInline={16}
        title="T"
        variant="outlined"
      />,
    );

    const root = container.firstElementChild as HTMLElement;
    expect(root).toHaveStyle({ padding: '24px' });
    expect(root.style.paddingBlock).toBe('8px');
    expect(root.style.paddingInline).toBe('16px');
    expect(root.style.border).not.toBe('');
  });

  it('defaults to the borderless variant', () => {
    const { container } = render(<StatisticCard title="T" />);

    expect((container.firstElementChild as HTMLElement).style.border).toBe('');
  });
});
