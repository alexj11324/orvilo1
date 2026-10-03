'use client';

import type { DeviceExecutionTarget } from '@orvilo/types';
import { useCallback } from 'react';

import { useAgentStore } from '@/store/agent';
import { agentByIdSelectors } from '@/store/agent/selectors';
import { useUserStore } from '@/store/user';

/**
 * The single write path for an agent's device selection
 * (docs/development/device-execution-contract.md — "each setting has exactly
 * one write entry").
 *
 * - Personal agent → `agents.agencyConfig` (the shared row is the only row).
 * - Workspace agent → the caller's own `agentDeviceOverrides` entry — EVERY
 *   workspace caller's pick is per-user (member, manager, private owner
 *   alike), because the shared row must never reference a personal device.
 *   This is what makes one member's pick invisible to everyone else's
 *   default.
 *
 * Callers pass devices their own `useDeviceSelectorState` already screened;
 * this hook re-checks the legal pool so a stale list cannot write a binding
 * the contract forbids.
 */
export const useSelectAgentDevice = (agentId: string) => {
  const agent = useAgentStore((s) => agentByIdSelectors.getAgentById(agentId)(s));
  const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);
  const updateWorkspaceUserPreference = useUserStore((s) => s.updateWorkspaceUserPreference);

  return useCallback(
    async ({
      boundDeviceId,
      executionTarget,
    }: {
      /** Device to bind; omitted when the target itself carries no binding. */
      boundDeviceId?: string;
      executionTarget: DeviceExecutionTarget;
    }) => {
      if (!agentId) return;
      const patch = {
        ...(boundDeviceId ? { boundDeviceId } : {}),
        executionTarget,
      };
      if (agent?.workspaceId) {
        await updateWorkspaceUserPreference({
          agentDeviceOverrides: {
            [agentId]: patch,
          },
        });
        return;
      }
      await updateAgentConfigById(agentId, { agencyConfig: patch });
    },
    [agent?.workspaceId, agentId, updateAgentConfigById, updateWorkspaceUserPreference],
  );
};
