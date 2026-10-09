/**
 * Whether the full-window first-Agent screen may cover the app.
 *
 * Only an account that has not finished onboarding is walled off. Once onboarding
 * is finished (including by skipping the Agent step) the app stays usable and the
 * missing Agent is surfaced inline instead, as in Multica and Plane.
 */
export const shouldCoverAppForAgentSetup = (input: {
  isLogin: boolean | undefined;
  onboardingFinished: boolean;
  onOnboardingPath: boolean;
  onSetupPath: boolean;
}): boolean =>
  !!input.isLogin && !input.onboardingFinished && !input.onOnboardingPath && !input.onSetupPath;
