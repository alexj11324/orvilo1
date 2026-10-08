import { describe, expect, it } from 'vitest';

import { shouldCoverAppForAgentSetup } from './gate';

const base = {
  isLogin: true,
  onboardingFinished: false,
  onOnboardingPath: false,
  onSetupPath: false,
};

describe('shouldCoverAppForAgentSetup', () => {
  it('covers the app only for a signed-in account that has not finished onboarding', () => {
    expect(shouldCoverAppForAgentSetup(base)).toBe(true);
  });

  it('never covers the app once onboarding is finished, including after a skip', () => {
    expect(shouldCoverAppForAgentSetup({ ...base, onboardingFinished: true })).toBe(false);
  });

  it('leaves signed-out visitors, the onboarding page and setup paths alone', () => {
    expect(shouldCoverAppForAgentSetup({ ...base, isLogin: false })).toBe(false);
    expect(shouldCoverAppForAgentSetup({ ...base, onOnboardingPath: true })).toBe(false);
    expect(shouldCoverAppForAgentSetup({ ...base, onSetupPath: true })).toBe(false);
  });
});
