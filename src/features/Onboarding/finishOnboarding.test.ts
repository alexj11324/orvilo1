import { beforeEach, describe, expect, it, vi } from 'vitest';

import { finishOnboardingAndNavigate } from './finishOnboarding';

const targetMock = vi.hoisted(() => vi.fn(() => '/workspace'));

vi.mock('@/utils/onboardingRedirect', () => ({
  resolvePostOnboardingTargetUrl: targetMock,
}));

describe('finishOnboardingAndNavigate', () => {
  beforeEach(() => {
    targetMock.mockClear();
  });

  it('waits for onboarding persistence before navigating to the target', async () => {
    const events: string[] = [];
    const finishOnboarding = vi.fn(async () => {
      events.push('finish');
    });
    const navigate = vi.fn((target: string) => {
      events.push(`navigate:${target}`);
    });

    await finishOnboardingAndNavigate(finishOnboarding, navigate);

    expect(events).toEqual(['finish', 'navigate:/workspace']);
    expect(targetMock).toHaveBeenCalledTimes(1);
  });
});
