import { useLocation } from 'react-router';

import { useUserStore } from '@/store/user';
import { buildOnboardingRedirectUrl } from '@/utils/onboardingRedirect';

import { isFirstAgentSetupPath } from './setupPath';

export const useFirstLoginGate = () => {
  const { pathname, search } = useLocation();
  const [signedIn, loaded, initialized, error, finished, refresh] = useUserStore((s) => [
    s.isSignedIn,
    s.isLoaded,
    s.isUserStateInit,
    s.isUserStateInitError,
    !!s.onboarding?.finishedAt,
    s.refreshUserState,
  ]);
  if (pathname === '/onboarding' || isFirstAgentSetupPath(pathname))
    return { status: 'allowed' as const };
  if (!loaded || (signedIn && !initialized && !error)) return { status: 'loading' as const };
  if (signedIn && error) return { status: 'error' as const, error, retry: refresh };
  if (signedIn && !finished)
    return { status: 'redirect' as const, target: buildOnboardingRedirectUrl(pathname + search) };
  return { status: 'allowed' as const };
};
