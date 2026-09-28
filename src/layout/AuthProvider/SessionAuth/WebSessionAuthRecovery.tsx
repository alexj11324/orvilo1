'use client';

import { memo, useEffect, useRef } from 'react';

import { getUserStoreState } from '@/store/user/store';

import { sessionAuthEvents } from './events';

/**
 * Web adapter for `session-auth-expired`. Mirrors the recovery the tRPC error
 * link used to run inline: a signed-in user whose session died is logged out
 * and sent to `/signin` with the current location threaded as the callback;
 * an already-signed-out visitor gets the login-required notification instead.
 *
 * Single-flight: once recovery starts, further events are ignored — a 401
 * burst must not stack redirects on top of each other.
 */
const WebSessionAuthRecovery = memo(() => {
  const recoveringRef = useRef(false);

  useEffect(() => {
    const unsubscribe = sessionAuthEvents.on('session-auth-expired', async () => {
      if (recoveringRef.current) return;
      recoveringRef.current = true;

      const { isSignedIn, logout } = getUserStoreState();
      try {
        if (isSignedIn) {
          const params = new URLSearchParams({ callbackUrl: location.toString() });
          params.set('reason', 'sessionExpired');
          await logout({ redirectTo: `/signin?${params.toString()}` });
        } else {
          const { loginRequired } = await import('@/components/Error/loginRequiredNotification');
          loginRequired.redirect({ reason: 'sessionExpired' });
        }
      } catch (error) {
        // A failed recovery must not wedge the flag: the next 401 retries.
        recoveringRef.current = false;
        console.error('[SessionAuth] Recovery failed:', error);
      }
    });

    return unsubscribe;
  }, []);

  return null;
});

WebSessionAuthRecovery.displayName = 'WebSessionAuthRecovery';

export default WebSessionAuthRecovery;
