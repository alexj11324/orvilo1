import { mutate } from '@/libs/swr';

import { getMemorySession, isMemorySessionKey } from './session';

/** Clear all cached pages/searches before refreshing; failed reloads cannot retain deleted content. */
export const invalidateMemoryCaches = async (session: number) => {
  if (session !== getMemorySession()) return;
  await mutate(
    (key) =>
      isMemorySessionKey(key, session) &&
      typeof key[0] === 'string' &&
      key[0].startsWith('userMemory:'),
    undefined,
    { revalidate: true },
  );
};
