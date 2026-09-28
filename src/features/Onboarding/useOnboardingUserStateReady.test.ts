import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { useUserStore } from '@/store/user';

import { useOnboardingUserStateReady } from './useOnboardingUserStateReady';

const ready = () => renderHook(() => useOnboardingUserStateReady()).result.current;

const resetStore = () =>
  useUserStore.setState({
    isLoaded: false,
    isSignedIn: false,
    isUserStateInit: false,
    isUserStateInitError: undefined,
  });

describe('useOnboardingUserStateReady', () => {
  beforeEach(resetStore);
  afterEach(resetStore);

  it('is not ready while the session check is still in flight', () => {
    // Regression: before the gate, the wizard mounted in this window and
    // `useState(initialTimezone)` captured the detected zone; a blind resubmit
    // then overwrote the persisted timezone.
    expect(ready()).toBe(false);
  });

  it('is not ready while the user-state fetch is pending for a signed-in user', () => {
    useUserStore.setState({ isLoaded: true, isSignedIn: true });
    expect(ready()).toBe(false);
  });

  it('becomes ready once the user state is hydrated', () => {
    useUserStore.setState({ isLoaded: true, isSignedIn: true, isUserStateInit: true });
    expect(ready()).toBe(true);
  });

  it('is ready immediately for a signed-out session — nothing to hydrate', () => {
    useUserStore.setState({ isLoaded: true, isSignedIn: false });
    expect(ready()).toBe(true);
  });

  it('opens with defaults when the user-state fetch failed rather than hanging', () => {
    useUserStore.setState({
      isLoaded: true,
      isSignedIn: true,
      isUserStateInitError: new Error('boom'),
    });
    expect(ready()).toBe(true);
  });
});
