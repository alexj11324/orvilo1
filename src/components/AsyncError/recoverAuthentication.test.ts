import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recoverAuthentication } from './recoverAuthentication';

const mocks = vi.hoisted(() => ({ desktop: false, emit: vi.fn(), redirect: vi.fn() }));
vi.mock('@/const/version', () => ({
  get isDesktop() {
    return mocks.desktop;
  },
}));
vi.mock('@/layout/AuthProvider/SessionAuth/events', () => ({
  sessionAuthEvents: { emit: mocks.emit },
}));
vi.mock('@/components/Error/loginRequiredNotification', () => ({
  loginRequired: { redirect: mocks.redirect },
}));

describe('async authentication recovery transport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses the Web login action that preserves the current callback URL', async () => {
    mocks.desktop = false;
    await recoverAuthentication();
    expect(mocks.redirect).toHaveBeenCalledWith({ reason: 'sessionExpired' });
    expect(mocks.emit).not.toHaveBeenCalled();
  });

  it('uses the desktop adapter to reopen native authentication without a Web redirect', async () => {
    mocks.desktop = true;
    await recoverAuthentication();
    expect(mocks.emit).toHaveBeenCalledWith(
      'session-auth-expired',
      expect.objectContaining({
        reason: 'user-requested-sign-in',
        source: 'user-action',
      }),
    );
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
