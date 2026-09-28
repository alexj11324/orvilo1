import { useCallback } from 'react';

import { isDesktop } from '@/const/version';
import { useUserStore } from '@/store/user';

export const useSignOut = () => {
  const signOut = useUserStore((s) => s.logout);

  return useCallback(async () => {
    if (!isDesktop) {
      signOut();
      return;
    }

    try {
      // Must clear the remote server config: the main process holds encrypted OIDC
      // tokens that survive a plain store logout.
      const { remoteServerService } = await import('@/services/electron/remoteServer');
      await remoteServerService.clearRemoteServerConfig();
    } catch (error) {
      console.error(error);
    } finally {
      signOut();
      // The unified onboarding owns the signed-out journey on every client;
      // its desktop auth gate restarts the system-browser OIDC round trip.
      location.href = '/onboarding';
    }
  }, [signOut]);
};
