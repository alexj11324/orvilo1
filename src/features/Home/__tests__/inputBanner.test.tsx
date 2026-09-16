import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useGlobalStore } from '@/store/global';

import { InputBanner, InputBannerQueue, InputBannerSegment } from '../InputArea/InputBanner';

/**
 * Owns its module registry because it needs the **real** global store, while the
 * Home dashboard tests next door mock it away. That is also why the imports are
 * static: `vi.mock` is hoisted above them, so the mock still lands first — and
 * the graph is then evaluated once during collection instead of inside `it()`.
 *
 * That last part is the point. Loaded lazily with `vi.resetModules()` +
 * `vi.doMock`, the real store graph is re-evaluated *within* the test body, and
 * that evaluation measures ~13s on this machine (for comparison, the whole Home
 * graph costs ~7s). Against a 20s budget that is 1.5x of headroom, so any
 * concurrent load on the machine turned it into "Test timed out in 20000ms" —
 * a red run that says nothing about the banner queue.
 */
vi.mock('@lobehub/ui/base-ui', () => ({
  ActionIcon: ({ onClick, title }: { onClick?: (e: React.MouseEvent) => void; title?: string }) => (
    <button aria-label={title} type={'button'} onClick={onClick} />
  ),
}));

describe('Home input banner queue', () => {
  it('reveals the next available segment after dismissing the current one', () => {
    const originalDismissedIds = useGlobalStore.getState().status.dismissedBannerIds;
    const originalStatusInit = useGlobalStore.getState().isStatusInit;
    useGlobalStore.setState((state) => ({
      isStatusInit: true,
      status: { ...state.status, dismissedBannerIds: [] },
    }));

    try {
      const { container } = render(
        <InputBannerQueue>
          <InputBannerSegment dismissId={'first'}>
            <InputBanner dismissId={'first'} dismissTitle={'Dismiss first'} testId={'first'}>
              First
            </InputBanner>
          </InputBannerSegment>
          <InputBannerSegment dismissId={'second'}>
            <InputBanner dismissId={'second'} dismissTitle={'Dismiss second'} testId={'second'}>
              Second
            </InputBanner>
          </InputBannerSegment>
        </InputBannerQueue>,
      );

      expect(container.querySelector('[data-home-input-banner]')).toHaveTextContent('First');
      expect(screen.getByTestId('first')).toBeVisible();
      expect(screen.getByTestId('second')).not.toBeVisible();
      fireEvent.click(within(screen.getByTestId('first')).getByRole('button'));
      expect(container.querySelector('[data-home-input-banner]')).toHaveTextContent('Second');
      expect(screen.getByTestId('second')).toBeVisible();
    } finally {
      useGlobalStore.setState((state) => ({
        isStatusInit: originalStatusInit,
        status: { ...state.status, dismissedBannerIds: originalDismissedIds },
      }));
    }
  });
});
