import { resolvePostOnboardingTargetUrl } from '@/utils/onboardingRedirect';

export const finishOnboardingAndNavigate = async (
  finishOnboarding: () => Promise<void>,
  navigate: (target: string) => void,
) => {
  await finishOnboarding();
  navigate(resolvePostOnboardingTargetUrl());
};
