import { useSyncExternalStore } from 'react';

import { useUserStore } from '@/store/user';

let session = 0;
const listeners = new Set<() => void>();

// A generation also fences Alice → Bob → Alice without reusing Alice's old cache.
useUserStore.subscribe((state, previous) => {
  if (state.user?.id === previous.user?.id) return;
  session += 1;
  listeners.forEach((listener) => listener());
});

export const getMemorySession = () => session;
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useMemorySession = () =>
  useSyncExternalStore(subscribe, getMemorySession, getMemorySession);

export const memorySessionKey = (key: readonly unknown[], current = getMemorySession()) => [
  ...key,
  { session: current },
];

export const isMemorySessionKey = (key: unknown, current: number): key is unknown[] => {
  if (!Array.isArray(key)) return false;
  // useClientDataSWR appends its workspace ID after our session marker.
  const scope = typeof key.at(-1) === 'string' ? key.at(-2) : key.at(-1);
  return scope !== null && typeof scope === 'object' && scope.session === current;
};
