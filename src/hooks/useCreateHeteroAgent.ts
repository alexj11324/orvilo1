import { isDesktop } from '@orvilo/const';
import { type HeterogeneousAgentClientConfig } from '@orvilo/heterogeneous-agents/client';
import { useCallback } from 'react';

import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { gatewayConnectionService } from '@/services/electron/gatewayConnection';
import { useAgentStore } from '@/store/agent';
import { useElectronStore } from '@/store/electron';
import { useHomeStore } from '@/store/home';

export interface CreateHeteroAgentOptions {
  groupId?: string;
  onSuccess?: () => void;
  /**
   * Forwarded to the server-side `visibility` column when the call originates
   * from the sidebar's "Private" bucket. Defaults to undefined (public).
   */
  visibility?: 'private' | 'public';
}

/**
 * Create a heterogeneous agent (CLI-backed: Claude Code, Codex, …) and navigate
 * straight to the chat page. Skips the standard /profile redirect because the
 * external CLI runtime has a fixed config — there's nothing to edit upfront.
 */
export const useCreateHeteroAgent = () => {
  const storeCreateAgent = useAgentStore((s) => s.createAgent);
  const refreshAgentList = useHomeStore((s) => s.refreshAgentList);
  const currentDeviceId = useElectronStore((s) => s.gatewayDeviceInfo?.deviceId);
  const navigate = useWorkspaceAwareNavigate();

  return useCallback(
    async (definition: HeterogeneousAgentClientConfig, options?: CreateHeteroAgentOptions) => {
      // A detected CLI agent is a desktop-local runtime: pin the local target at
      // creation so the first send routes to Electron main instead of the
      // device gateway (`resolveExecutionTarget` reads `executionTarget`; an
      // unset value resolves to `none` and falls through to the gateway path).
      const boundDeviceId = isDesktop
        ? (currentDeviceId ?? (await gatewayConnectionService.getDeviceInfo())?.deviceId)
        : undefined;
      const result = await storeCreateAgent({
        config: {
          agencyConfig: {
            ...(boundDeviceId ? { boundDeviceId } : undefined),
            executionTarget: 'local' as const,
            heterogeneousProvider: {
              command: definition.defaultCommand,
              type: definition.type,
            },
          },
          avatar: definition.avatar,
          // Stamp the heterogeneous type as the agent's provider so every reader
          // (op rows, agent list, message tags) attributes the run to claude-code /
          // codex rather than the inherited default chat provider (e.g. orvilo).
          // The real chat model is reported by the CLI at runtime, so `model` stays
          // unset here and is backfilled per-run.
          provider: definition.type,
          systemRole: '',
          title: definition.title,
        },
        groupId: options?.groupId,
        visibility: options?.visibility,
      });
      await refreshAgentList();
      navigate(`/agent/${result.agentId}`);
      options?.onSuccess?.();
    },
    [storeCreateAgent, refreshAgentList, currentDeviceId, navigate],
  );
};
