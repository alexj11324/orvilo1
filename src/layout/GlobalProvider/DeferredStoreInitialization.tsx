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
  const useFetchAiProviderRuntimeState = useAiInfraStore((s) => s.useFetchAiProviderRuntimeState);
  const useFetchPersona = useUserMemoryStore((s) => s.useFetchPersona);
  const isSyncActive = useElectronStore((s) => electronSyncSelectors.isSyncActive(s));

  useFetchAiProviderRuntimeState(isLogin, isSyncActive);
  useFetchPersona(isLogin);

  return null;
});

export default DeferredStoreInitialization;
