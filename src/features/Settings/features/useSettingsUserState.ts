import { useRef, useState } from 'react';

import { useUserStore } from '@/store/user';

export const useSettingsUserState = () => {
  const [ready, error, refreshUserState] = useUserStore((s) => [
    s.isUserStateInit,
    s.isUserStateInitError,
    s.refreshUserState,
  ]);
  const [retrying, setRetrying] = useState(false);
  const retryInFlight = useRef(false);
  const retry = async () => {
    if (retryInFlight.current) return;
    retryInFlight.current = true;
    setRetrying(true);
    try {
      await refreshUserState();
    } catch {
      // Bootstrap records the new error; preserve its recovery state.
    } finally {
      retryInFlight.current = false;
      setRetrying(false);
    }
  };

  return { error, ready, retry, retrying };
};
