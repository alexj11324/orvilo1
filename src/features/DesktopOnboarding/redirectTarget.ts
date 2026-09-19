import { buildOnboardingRedirectUrl, isSafeRedirectPath } from '@/utils/onboardingRedirect';

import { DesktopOnboardingScreen, isDesktopOnboardingScreen } from './types';

/**
 * Resolve where the retired `/desktop-onboarding` route forwards to, given its
 * query string. `/onboarding` owns the account-onboarding state machine on
 * every client; the old path only maps legacy links to a legal target:
 *
 * - `?screen=permissions` — the OS-permission surface moved to device
 *   settings (`/settings/devices`).
 * - everything else — `/onboarding`, threading a same-site `callbackUrl`
 *   through untouched.
 *
 * Loop safety: callbacks pointing back at `/desktop-onboarding` or
 * `/onboarding` are dropped, so a finished user can never be bounced
 * onboarding → target → onboarding. Anything failing `isSafeRedirectPath`
 * (external URLs, `//host`, backslashes) falls back to bare `/onboarding`.
 */
export const resolveDesktopOnboardingRedirectTarget = (searchParams: URLSearchParams): string => {
  const screenParam = searchParams.get('screen');
  if (
    isDesktopOnboardingScreen(screenParam) &&
    screenParam === DesktopOnboardingScreen.Permissions
  ) {
    return '/settings/devices';
  }

  const callbackUrl = searchParams.get('callbackUrl');
  const usableCallback =
    callbackUrl &&
    isSafeRedirectPath(callbackUrl) &&
    !callbackUrl.startsWith('/desktop-onboarding') &&
    !callbackUrl.startsWith('/onboarding')
      ? callbackUrl
      : null;

  return buildOnboardingRedirectUrl(usableCallback);
};
