'use client';

import { memo } from 'react';

import { useAiInfraStore } from '@/store/aiInfra';
import { useUserMemoryStore } from '@/store/userMemory';

interface DeferredStoreInitializationProps {
  isLogin: boolean;
}

const DeferredStoreInitialization = memo<DeferredStoreInitializationProps>(({ isLogin }) => {
  // Static model catalog — no remote fetch, no auth/sync gating needed.
  const useInitModelCatalog = useAiInfraStore((s) => s.useInitModelCatalog);
  const useFetchPersona = useUserMemoryStore((s) => s.useFetchPersona);

  useInitModelCatalog();
  useFetchPersona(isLogin);

  return null;
});

export default DeferredStoreInitialization;
