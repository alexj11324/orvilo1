'use client';

import { useCallback } from 'react';
import { type PartialDeep } from 'type-fest';

import { useAgentStore } from '@/store/agent';
import { type OrviloAgentChatConfig, type OrviloAgentConfig } from '@/types/agent';

import { useAgentId } from './useAgentId';

/**
 * Hook to get update functions that work with the current agentId context.
 * Uses agentId from ChatInput store if provided, otherwise falls back to activeAgentId.
 */
export const useUpdateAgentConfig = () => {
  const agentId = useAgentId();
  const updateAgentConfigById = useAgentStore((s) => s.updateAgentConfigById);
  const updateAgentChatConfigById = useAgentStore((s) => s.updateAgentChatConfigById);

  const updateAgentConfig = useCallback(
    (config: PartialDeep<OrviloAgentConfig>) => {
      return updateAgentConfigById(agentId, config);
    },
    [agentId, updateAgentConfigById],
  );

  const updateAgentChatConfig = useCallback(
    (
      config: Partial<OrviloAgentChatConfig>,
      options?: Parameters<typeof updateAgentChatConfigById>[2],
    ) => {
      return updateAgentChatConfigById(agentId, config, options);
    },
    [agentId, updateAgentChatConfigById],
  );

  return { updateAgentChatConfig, updateAgentConfig };
};
