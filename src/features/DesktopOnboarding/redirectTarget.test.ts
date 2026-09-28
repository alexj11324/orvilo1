import { describe, expect, it } from 'vitest';

import { resolveDesktopOnboardingRedirectTarget } from './redirectTarget';

const targetFor = (query: string) =>
  resolveDesktopOnboardingRedirectTarget(new URLSearchParams(query));

describe('resolveDesktopOnboardingRedirectTarget', () => {
  it('forwards the retired flow to the unified /onboarding', () => {
    expect(targetFor('')).toBe('/onboarding');
  });

  it('drops the screen param the unified flow does not understand', () => {
    expect(targetFor('screen=login')).toBe('/onboarding');
  });

  it('routes the moved OS-permission screen to device settings', () => {
    expect(targetFor('screen=permissions')).toBe('/settings/devices');
  });

  it('threads a same-site callback through to onboarding', () => {
    expect(targetFor(`callbackUrl=${encodeURIComponent('/agent/abc')}`)).toBe(
      `/onboarding?callbackUrl=${encodeURIComponent('/agent/abc')}`,
    );
  });

  it('never threads the retired route itself as the callback (no loops)', () => {
    expect(targetFor(`callbackUrl=${encodeURIComponent('/desktop-onboarding?screen=login')}`)).toBe(
      '/onboarding',
    );
    expect(targetFor(`callbackUrl=${encodeURIComponent('/onboarding')}`)).toBe('/onboarding');
  });

  it('rejects external callbacks as open redirects', () => {
    expect(targetFor(`callbackUrl=${encodeURIComponent('https://evil.com/x')}`)).toBe(
      '/onboarding',
    );
    expect(targetFor(`callbackUrl=${encodeURIComponent('//evil.com/x')}`)).toBe('/onboarding');
  });
});
