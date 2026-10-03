import { snapshotTopicExecutionConfig } from '@orvilo/types';
import { useCallback } from 'react';

import { useTopicAgencyConfig } from '@/hooks/useTopicAgencyConfig';
import { topicService } from '@/services/topic';
import { useChatStore } from '@/store/chat';

export type RepairDeviceBindingResult = 'repaired' | 'binding-changed';

const storedBindingOf = (metadata: {
  boundDeviceId?: string;
  executionConfig?: { boundDeviceId?: string };
}) => metadata.executionConfig?.boundDeviceId ?? metadata.boundDeviceId;

/**
 * Repair write for a blocked run's device binding (`DEVICE_BINDING_INVALID` /
 * `DEVICE_BINDING_CONFLICT` / selection-required codes).
 *
 * The binding the admission contract enforces is the canonical triple the
 * server's first-bind CAS (`bindTopicDeviceAtomically`) writes — topic
 * `metadata.executionConfig.boundDeviceId` + `executionTarget: 'device'` +
 * the legacy top-level `metadata.boundDeviceId` — so the repair writes the
 * same shape. Clearing the `heteroSession*` handles makes the next run mint a
 * NEW execution session on the repaired device: reusing another device's
 * native session id under a relabeled config is exactly what the admission
 * layer rejects.
 *
 * Compare-and-swap: no server-side repair CAS exists yet (requested —
 * `topic.updateTopicMetadata` is a plain merge). Until then the client
 * approximates atomicity with a fresh read (`getTopicDetail` bypasses the
 * topic list's stale window) + verify against `expectedBoundDeviceId`, and
 * refuses to clobber a binding that changed underneath it.
 */
export const useRepairDeviceBinding = (agentId: string) => {
  const updateTopicMetadata = useChatStore((s) => s.updateTopicMetadata);
  const { agencyConfig } = useTopicAgencyConfig(agentId);

  return useCallback(
    async ({
      expectedBoundDeviceId,
      deviceId,
      topicId,
    }: {
      /** The device to bind — must be one of the admission repair candidates. */
      deviceId: string;
      /**
       * The binding the admission error observed (`errorData.deviceId`) —
       * `undefined` when the block was "nothing bound yet". The write is
       * refused if the topic's stored binding moved since.
       */
      expectedBoundDeviceId?: string;
      topicId: string;
    }): Promise<RepairDeviceBindingResult> => {
      const fresh = await topicService.getTopicDetail(topicId);
      if (!fresh) return 'binding-changed';
      const current = storedBindingOf(fresh.metadata ?? {});
      if (current !== expectedBoundDeviceId) return 'binding-changed';

      await updateTopicMetadata(topicId, {
        // Canonical binding triple — same shape `bindTopicDeviceAtomically`
        // persists on the server.
        boundDeviceId: deviceId,
        executionConfig: {
          ...snapshotTopicExecutionConfig(agencyConfig),
          inheritWorkspaceScope: false,
          boundDeviceId: deviceId,
          executionTarget: 'device',
        },
        // Repaired binding ⇒ next run builds a new execution session/context;
        // the old device's native session must not be resurrected.
        heteroSessionBindingKey: '',
        heteroSessionBindingKeyByWorkingDirectory: {},
        heteroSessionId: '',
        heteroSessionIdByWorkingDirectory: {},
      });
      return 'repaired';
    },
    [agencyConfig, updateTopicMetadata],
  );
};
