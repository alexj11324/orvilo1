import { isDesktop } from '@/const/version';
import { sessionAuthEvents } from '@/layout/AuthProvider/SessionAuth/events';

/** Use the existing platform recovery transport; keep the failed page as the callback. */
export const recoverAuthentication = async (): Promise<void> => {
  if (isDesktop) {
    // Reopen the native OIDC modal after dismissal. Never load Web /signin in Electron.
    sessionAuthEvents.emit('session-auth-expired', {
      reason: 'user-requested-sign-in',
      source: 'user-action',
      timestamp: Date.now(),
    });
    return;
  }

  const { loginRequired } = await import('@/components/Error/loginRequiredNotification');
  loginRequired.redirect({ reason: 'sessionExpired' });
};
