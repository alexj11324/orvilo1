import { useClientDataSWR } from '@/libs/swr';
import { userMemoryService } from '@/services/userMemory';
import { type LayersEnum } from '@/types/userMemory';

import { invalidateMemoryCaches } from './utils/invalidate';
import { getMemorySession, memorySessionKey, useMemorySession } from './utils/session';

export const useLegacyMemoryPage = (layer: LayersEnum, page: number, q: string) => {
  const session = useMemorySession();
  return useClientDataSWR(
    memorySessionKey(['userMemory:legacyPage', layer, page, q], session),
    () => userMemoryService.queryMemories({ layer, page, pageSize: 20, q: q || undefined }),
    { keepPreviousData: false },
  );
};

export const createLegacyMemory = async (layer: LayersEnum, content: string, session: number) => {
  if (session !== getMemorySession()) return;
  await userMemoryService.createManual(layer, content);
  if (session === getMemorySession()) await invalidateMemoryCaches(session);
};
