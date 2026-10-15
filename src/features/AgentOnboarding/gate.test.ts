import { describe, expect, it } from 'vitest';

import { shouldCoverAppForAgentSetup } from './gate';

const base = {
  isLogin: true,
  onOnboardingPath: false,
  onSetupPath: false,
};

describe('shouldCoverAppForAgentSetup', () => {
  it('covers the app for any signed-in account, finished onboarding or not', () => {
    expect(shouldCoverAppForAgentSetup(base)).toBe(true);
  });

  it('does not cover the app while authentication is unresolved', () => {
    expect(shouldCoverAppForAgentSetup({ ...base, isLogin: undefined })).toBe(false);
  });

  it('leaves signed-out visitors, the onboarding page and setup paths alone', () => {
    expect(shouldCoverAppForAgentSetup({ ...base, isLogin: false })).toBe(false);
    expect(shouldCoverAppForAgentSetup({ ...base, onOnboardingPath: true })).toBe(false);
    expect(shouldCoverAppForAgentSetup({ ...base, onSetupPath: true })).toBe(false);
  });
});
