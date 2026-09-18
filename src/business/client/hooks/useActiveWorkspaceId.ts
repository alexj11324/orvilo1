// DEV-ONLY acceptance shim — resolves the active workspace from localStorage.
// NOT FOR COMMIT: the cloud build overrides this slot with real URL sync.
import { useSyncExternalStore } from 'react';

const KEY = '__acc_ws_id';
const subscribe = (cb: () => void) => {
  window.addEventListener('storage', cb);
  return () => window.removeEventListener('storage', cb);
};
export const getActiveWorkspaceId = (): string | null =>
  typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);

export const useActiveWorkspaceId = (): string | null =>
  useSyncExternalStore(subscribe, getActiveWorkspaceId, () => null);
