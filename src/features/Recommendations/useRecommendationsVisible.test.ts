import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

interface LoadHookOptions {
  actions?: { id: string }[];
  hiddenHomeWidgets?: string[];
}

const loadHook = async ({ actions = [], hiddenHomeWidgets = [] }: LoadHookOptions = {}) => {
  vi.resetModules();

  const renderNothing = () => null;

  vi.doMock('./RecommendationCard', () => ({ RecommendationCard: renderNothing }));
  vi.doMock('@/features/Home/components/GroupBlock', () => ({ default: renderNothing }));
  vi.doMock('@/features/Home/components/RailCard', () => ({ default: renderNothing }));
  function translate() {
    return { i18n: { language: 'en-US' }, t: (key: string) => key };
  }
  vi.doMock('react-i18next', () => ({ useTranslation: translate }));
  function selectFromGlobalStore(selector: (state: unknown) => unknown) {
    return selector({ status: { hiddenHomeWidgets } });
  }
  vi.doMock('@/store/global', () => ({ useGlobalStore: selectFromGlobalStore }));
  function readEligibleActions() {
    return { actions };
  }
  vi.doMock('./hooks/useEligibleActions', () => ({ useEligibleActions: readEligibleActions }));

  const { useRecommendationsVisible } = await import('./index');

  return renderHook(() => useRecommendationsVisible()).result.current;
};

afterEach(() => {
  vi.doUnmock('@/features/Home/components/GroupBlock');
  vi.doUnmock('@/features/Home/components/RailCard');
  vi.doUnmock('@/store/global');
  vi.doUnmock('react-i18next');
  vi.doUnmock('./hooks/useEligibleActions');
  vi.doUnmock('./RecommendationCard');
});

describe('useRecommendationsVisible', () => {
  it('keeps suggestions hidden when there are no native setup actions', async () => {
    expect(await loadHook()).toBe(false);
  }, 20000);

  it('shows suggestions when an eligible action exists without task templates', async () => {
    expect(await loadHook({ actions: [{ id: 'connect-drive' }] })).toBe(true);
  }, 20000);

  it('hides suggestions when the widget is turned off, without native setup actions', async () => {
    expect(await loadHook({ hiddenHomeWidgets: ['suggestions'] })).toBe(false);
  }, 20000);

  it('hides suggestions when the widget is turned off, despite an eligible action', async () => {
    expect(
      await loadHook({
        actions: [{ id: 'connect-drive' }],
        hiddenHomeWidgets: ['suggestions'],
      }),
    ).toBe(false);
  }, 20000);

  it('leaves suggestions alone when other widgets are the hidden ones and native setup is eligible', async () => {
    expect(
      await loadHook({
        hiddenHomeWidgets: ['needsYou', 'news'],
        actions: [{ id: 'connect-agent' }],
      }),
    ).toBe(true);
  }, 20000);

  it('stays hidden with nothing to suggest and nothing turned off', async () => {
    expect(await loadHook()).toBe(false);
  }, 20000);
});
