import { useCallback } from 'react';

import { lambdaClient } from '@/libs/trpc/client';
import { topicService } from '@/services/topic';
import { getChatStoreState } from '@/store/chat';

export type RepairDeviceBindingResult = 'repaired' | 'binding-changed';

/**
 * Repair write for a blocked run's device binding (`DEVICE_BINDING_INVALID` /
 * `DEVICE_BINDING_CONFLICT` / selection-required codes).
 *
 * The write is delegated to the server's CAS endpoint
 * `topic.repairDeviceBinding` — the same server-side CAS class
 * `bindTopicDeviceAtomically` uses for first-bind. The server owns the
 * canonical triple write (`metadata.executionConfig.boundDeviceId` +
 * `executionTarget: 'device'` + the legacy top-level `boundDeviceId`), the
 * `bindingRevision++` epoch stamp, `heteroSession*` cleanup (a repaired
 * binding must mint a NEW execution session — reusing another device's
 * native session id under a relabeled config is exactly what admission
 * rejects) and the workspace audit row.
 *
 * The client only forwards the binding + revision the admission error showed:
 * a binding that moved underneath returns `binding-changed` with the winner's
 * pin, never an overwrite. On success the fresh topic row folds into the
 * store through the same `internal_dispatchTopic` funnel every server-sourced
 * row uses, so the displayed binding reflects the repair.
 */
export const useRepairDeviceBinding = (_agentId: string) =>
  useCallback(
    async ({
      deviceId,
      expectedBindingRevision,
      expectedBoundDeviceId,
      topicId,
    }: {
      /** The device to bind — must be one of the admission repair candidates. */
      deviceId: string;
      /**
       * The `metadata.bindingRevision` epoch the admission error echoed back
       * (`errorData.bindingRevision`). Passed through verbatim — the server
       * CAS requires it when present; pre-revision errors may omit it.
       */
      expectedBindingRevision?: number;
      /**
       * The binding the admission error observed (`errorData.deviceId`) —
       * `undefined` when the block was "nothing bound yet". The CAS compares
       * it either way, so a stale expectation loses honestly.
       */
      expectedBoundDeviceId?: string;
      topicId: string;
    }): Promise<RepairDeviceBindingResult> => {
      const result = await lambdaClient.topic.repairDeviceBinding.mutate({
        deviceId,
        expectedBindingRevision,
        expectedBoundDeviceId,
        id: topicId,
      });
      if (result.outcome === 'binding-changed') return 'binding-changed';

      // Fold the server's fresh row into the store — the binding every
      // surface displays must reflect the repair, not the pre-repair pin.
      const fresh = await topicService.getTopicDetail(topicId);
      if (fresh) {
        getChatStoreState().internal_dispatchTopic(
          {
            id: topicId,
            type: 'updateTopic',
            value: { metadata: fresh.metadata, status: fresh.status },
          },
          'repairDeviceBinding',
        );
      }
      return 'repaired';
    },
    [],
  );
