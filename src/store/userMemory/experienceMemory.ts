import { useClientDataSWR } from '@/libs/swr';
import { experienceMemoryService } from '@/services/experienceMemory';

import { invalidateMemoryCaches } from './utils/invalidate';
import { getMemorySession, memorySessionKey, useMemorySession } from './utils/session';

export const useExperienceMemory = (query: string, page: number) => {
  const session = useMemorySession();
  const response = useClientDataSWR(
    memorySessionKey(['userMemory:prime', query, page], session),
    async () =>
      query ? experienceMemoryService.search(query) : experienceMemoryService.list((page - 1) * 20),
    { keepPreviousData: false },
  );
  const change = async (operation: () => Promise<unknown>) => {
    if (session !== getMemorySession()) return;
    await operation();
    if (session === getMemorySession()) await invalidateMemoryCaches(session);
  };
  return {
    ...response,
    create: (content: string) => change(() => experienceMemoryService.create(content)),
    update: (id: string, revision: number, content: string) =>
      change(() => experienceMemoryService.update(id, revision, content)),
    remove: (id: string, revision: number) =>
      change(() => experienceMemoryService.delete(id, revision)),
  };
};
