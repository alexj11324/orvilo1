import { isDesktopOnboardingScreen } from './types';

export const DESKTOP_ONBOARDING_COMPLETED_KEY = 'orvilo:desktop:onboarding:completed:v1';
export const DESKTOP_ONBOARDING_EVER_COMPLETED_KEY = 'orvilo:desktop:onboarding:everCompleted:v1';
// v3 resets persisted positions created while Login preceded Welcome.
export const DESKTOP_ONBOARDING_SCREEN_KEY = 'orvilo:desktop:onboarding:screen:v3';

/**
 * Mark onboarding as completed for this session
 */
export const setDesktopOnboardingCompleted = () => {
  if (typeof window === 'undefined') return false;

  try {
    window.sessionStorage.setItem(DESKTOP_ONBOARDING_COMPLETED_KEY, '1');
    return true;
  } catch {
    return false;
  }
};

/**
 * Whether the user has *ever* completed desktop onboarding on this install.
 * Backed by localStorage so it survives quit/relaunch — used to skip first-run
 * screens (Welcome / Permissions / DataMode) when a returning user is sent
 * back to /desktop-onboarding (e.g. token refresh failed, sign-out).
 */
export const getDesktopOnboardingEverCompleted = () => {
  if (typeof window === 'undefined') return false;

  try {
    return window.localStorage.getItem(DESKTOP_ONBOARDING_EVER_COMPLETED_KEY) === '1';
  } catch {
    return false;
  }
};

/**
 * Mark desktop onboarding as completed permanently. Should be called once on
 * first-time completion and is never cleared.
 */
export const setDesktopOnboardingEverCompleted = () => {
  if (typeof window === 'undefined') return false;

  try {
    window.localStorage.setItem(DESKTOP_ONBOARDING_EVER_COMPLETED_KEY, '1');
    return true;
  } catch {
    return false;
  }
};

/**
 * Get the persisted onboarding screen (for restoring after app restart)
 */
export const getDesktopOnboardingScreen = () => {
  if (typeof window === 'undefined') return null;

  try {
    const screen = window.localStorage.getItem(DESKTOP_ONBOARDING_SCREEN_KEY);
    if (!screen) return null;
    if (!isDesktopOnboardingScreen(screen)) return null;
    return screen;
  } catch {
    return null;
  }
};
