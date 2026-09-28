import { useUserStore } from '@/store/user';

/**
 * The wizard seeds its fields from the user store, which fills in
 * asynchronously: mounting early captures detected defaults via
 * `useState(initial*)`, and a blind resubmit can then clobber persisted
 * values (e.g. the stored timezone reverts to the browser zone). Wait for
 * the user-state fetch — or its failure / the anonymous path — first.
 */
export const useOnboardingUserStateReady = (): boolean =>
  useUserStore((s) => {
    if (!s.isLoaded) return false;
    if (!s.isSignedIn) return true;
    return s.isUserStateInit || Boolean(s.isUserStateInitError);
  });
