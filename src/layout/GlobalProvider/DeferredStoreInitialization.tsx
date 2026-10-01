'use client';

import { memo } from 'react';

import { useAiInfraStore } from '@/store/aiInfra';
import { useElectronStore } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';
import { useUserMemoryStore } from '@/store/userMemory';

interface DeferredStoreInitializationProps {
  isLogin: boolean;
}

const DeferredStoreInitialization = memo<DeferredStoreInitializationProps>(({ isLogin }) => {
  // Static model catalog — no remote fetch, no auth/sync gating needed.
  const useInitModelCatalog = useAiInfraStore((s) => s.useInitModelCatalog);
  const useInitAiProviderKeyVaults = useAiInfraStore((s) => s.useFetchAiProviderRuntimeState);
  const useFetchPersona = useUserMemoryStore((s) => s.useFetchPersona);
  const isSyncActive = useElectronStore((s) => electronSyncSelectors.isSyncActive(s));

  useInitModelCatalog();
  useInitAiProviderKeyVaults(isLogin, isSyncActive);
  useFetchPersona(isLogin);

  return null;
});

export default DeferredStoreInitialization;
