import { act, cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import EmojiPicker from './index';

const lazyPicker = vi.hoisted(() => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { ready, release, rendered: vi.fn() };
});

vi.mock('@/store/global', () => ({ useGlobalStore: () => 'en-US' }));
vi.mock('@/store/global/selectors', () => ({
  globalGeneralSelectors: { currentLanguage: vi.fn() },
}));
vi.mock('@lobehub/ui/es/EmojiPicker/index', async () => {
  await lazyPicker.ready;
  return {
    default: (props: Record<string, unknown>) => {
      lazyPicker.rendered(props);
      return <button type="button">{props.value as ReactNode}</button>;
    },
  };
});

afterEach(cleanup);

describe('EmojiPicker deferred trigger loading', () => {
  it('keeps the numerical placeholder size for ordinary callers', () => {
    const { container } = render(<EmojiPicker size={36} value="📦" />);
    const skeleton = container.querySelector('[data-slot="skeleton"]');
    expect(skeleton).toHaveStyle({ height: '36px', width: '36px' });
  });

  it('shows the caller placeholder until ready and consumes the loading slot locally', async () => {
    const onChange = vi.fn();
    render(
      <EmojiPicker
        customRender={() => <span>Project icon</span>}
        fallback={<span data-testid="custom-trigger-loading">Loading icon</span>}
        value="📦"
        onChange={onChange}
      />,
    );

    expect(screen.getByTestId('custom-trigger-loading')).toHaveTextContent('Loading icon');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    await act(async () => {
      lazyPicker.release();
    });

    expect(await screen.findByRole('button', { name: '📦' })).toBeInTheDocument();
    expect(screen.queryByTestId('custom-trigger-loading')).not.toBeInTheDocument();
    const props = lazyPicker.rendered.mock.lastCall?.[0];
    expect(props).toEqual(
      expect.objectContaining({ defaultAvatar: null, locale: 'en-US', onChange, shape: 'square' }),
    );
    expect(props).not.toHaveProperty('fallback');
  });
});
