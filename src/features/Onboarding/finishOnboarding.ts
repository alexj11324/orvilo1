import { isDesktop } from '@/const/version';
import { resolvePostOnboardingTargetUrl } from '@/utils/onboardingRedirect';

/**
 * The account-level `finishedAt` write is the only authoritative completion
 * record. On Electron the boot path and the auto-OIDC gate still read local
 * markers, so finishing on desktop also repairs them — hints, never a second
 * source of truth. A failed repair must not block the navigation: the next
 * launch simply takes the `/onboarding` detour once and skips out again.
 */
export const repairDesktopOnboardingMarkers = async (): Promise<void> => {
  const [{ electronSystemService }, storage] = await Promise.all([
    import('@/services/electron/system'),
    import('@/features/DesktopOnboarding/storage'),
  ]);

  storage.setDesktopOnboardingCompleted();
  storage.setDesktopOnboardingEverCompleted();

  try {
    await electronSystemService.setDesktopOnboardingCompleted(true);
  } catch (error) {
    console.error('[Onboarding] Failed to repair the desktop onboarding marker:', error);
  }
};

export const finishOnboardingAndNavigate = async (
  finishOnboarding: () => Promise<void>,
  navigate: (target: string) => void,
) => {
  await finishOnboarding();
  if (isDesktop) await repairDesktopOnboardingMarkers();
  navigate(resolvePostOnboardingTargetUrl());
};
