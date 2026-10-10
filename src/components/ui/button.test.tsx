import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';
import { InputGroupButton } from './input-group';

describe('Button loading', () => {
  it('renders the spinner before children and disables the button', () => {
    const onClick = vi.fn();
    const { container } = render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    const spinner = container.querySelector('[data-slot="spinner"]');
    expect(spinner).not.toBeNull();
    expect(spinner).toHaveAttribute('data-icon', 'inline-start');
    expect(screen.getByText('Save')).toBeInTheDocument();
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('renders normally without loading', () => {
    render(<Button>Save</Button>);
    const button = screen.getByRole('button');
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });
});

describe('InputGroupButton size compatibility', () => {
  it('retains its compact sm geometry and forwards button interaction', () => {
    const onClick = vi.fn();
    render(
      <InputGroupButton size="sm" onClick={onClick}>
        Search
      </InputGroupButton>,
    );
    const button = screen.getByRole('button', { name: 'Search' });
    expect(button).toHaveClass('h-8');
    expect(button).toHaveAttribute('type', 'button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });
});
