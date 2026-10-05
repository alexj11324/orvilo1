'use client';

import { isDesktop } from '@orvilo/const';
import { type DeviceExecutionTarget, snapshotTopicExecutionConfig } from '@orvilo/types';
import { t } from 'i18next';

import { toast } from '@/components/toast';
import { useTopicAgencyConfig } from '@/hooks/useTopicAgencyConfig';
import { gatewayConnectionService } from '@/services/electron/gatewayConnection';
import { useChatStore } from '@/store/chat';
import { topicSelectors } from '@/store/chat/selectors';
import { useElectronStore } from '@/store/electron';

import { useCurrentComposerAgentId } from './useAgentId';

export interface SelectExecutionTargetOptions {
  localSandbox?: boolean;
  localSandboxNetwork?: boolean;
  silent?: boolean;
}

/** Capture the destination before device discovery or persistence can yield. */
export const useSelectExecutionTarget = (agentId: string) => {
  const { agencyConfig, canSelectExecutionTarget } = useTopicAgencyConfig(agentId);
  const topicId = useChatStore(topicSelectors.activeTopicIdForAgent(agentId));
  const getCurrentComposerAgentId = useCurrentComposerAgentId();
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);

  return async (
    target: DeviceExecutionTarget,
    deviceId?: string,
    options?: SelectExecutionTargetOptions,
  ) => {
    if (!canSelectExecutionTarget) return;
    // An automatic default must not create an empty conversation on mount.
    if (options?.silent && !topicId) return;
    if (
      !topicId &&
      (getCurrentComposerAgentId() !== agentId || useChatStore.getState().activeTopicId)
    )
      return;
    try {
      let boundDeviceId = target === 'device' ? deviceId : undefined;
      if (target === 'local') {
        boundDeviceId =
          (isDesktop ? currentDeviceId : undefined) ??
          (await gatewayConnectionService.getDeviceInfo())?.deviceId;
        if (!boundDeviceId) return;
      }
      if (target === 'device' && !boundDeviceId) return;
      const store = useChatStore.getState();
      if (!topicId && (getCurrentComposerAgentId() !== agentId || store.activeTopicId)) return;
      const destination = topicId ?? (await store.createTopic(agentId));
      if (!destination) return;
      await useChatStore.getState().updateTopicMetadata(destination, {
        executionConfig: {
          ...snapshotTopicExecutionConfig(agencyConfig),
          inheritWorkspaceScope: false,
          boundDeviceId,
          executionTarget: target,
          ...(options?.localSandbox === undefined ? {} : { localSandbox: options.localSandbox }),
          ...(options?.localSandboxNetwork === undefined
            ? {}
            : { localSandboxNetwork: options.localSandboxNetwork }),
        },
      });
      if (
        !topicId &&
        getCurrentComposerAgentId() === agentId &&
        !useChatStore.getState().activeTopicId
      ) {
        await useChatStore.getState().switchTopic(destination);
      }
    } catch {
      if (!options?.silent) toast.error(t('saveAgentConfigFail', { ns: 'common' }));
    }
  };
};
