import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useUserStore } from '@/store/user';

import { scrollToSettingsAnchor } from './anchor';

describe('settings anchor motion preference', () => {
  const originalSettings = useUserStore.getState().settings;
  let target: HTMLSpanElement;
  let scrollIntoView: ReturnType<typeof vi.fn>;

  const setMotion = (mode: 'disabled' | 'agile', reduced: boolean) => {
    useUserStore.setState({
      settings: {
        ...originalSettings,
        general: { ...originalSettings.general, animationMode: mode },
      },
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: reduced })),
    );
  };

  beforeEach(() => {
    vi.useFakeTimers();
    // This fixture has an ASCII anchor; the owning module still calls CSS.escape.
    vi.stubGlobal('CSS', { ...globalThis.CSS, escape: (value: string) => value });
    target = document.createElement('span');
    target.setAttribute('data-settings-anchor', 'motion-fixture');
    scrollIntoView = vi.fn();
    Object.defineProperty(target, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    document.body.append(target);
  });

  afterEach(() => {
    useUserStore.setState({ settings: originalSettings });
    target.remove();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('uses native auto scrolling when the user disables animation and the OS allows it', () => {
    setMotion('disabled', false);
    scrollToSettingsAnchor('motion-fixture')();
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
  });

  it('uses native auto scrolling when the OS reduces motion', () => {
    setMotion('agile', true);
    scrollToSettingsAnchor('motion-fixture')();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' });
  });

  it('keeps smooth scrolling when both actual motion preferences allow it', () => {
    setMotion('agile', false);
    scrollToSettingsAnchor('motion-fixture')();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });
});
