/**
 * Whether the full-window first-Agent screen may cover the app.
 *
 * Nothing in the product works without an Agent, so every signed-in account is
 * held here until one is usable — finishing onboarding does not lift it. The
 * onboarding page and the setup paths stay open: they are where the missing
 * piece gets fixed.
 */
export const shouldCoverAppForAgentSetup = (input: {
  isLogin: boolean | undefined;
  onOnboardingPath: boolean;
  onSetupPath: boolean;
}): boolean => !!input.isLogin && !input.onOnboardingPath && !input.onSetupPath;
