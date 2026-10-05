'use client';

import type { HeterogeneousAgentType } from '@orvilo/heterogeneous-agents';
import type { AgentItem } from '@orvilo/types';
import { t as i18nT } from 'i18next';

import { createModal, type ModalInstance, useModalContext } from '@/components/Modal';
import { openNewConversation } from '@/features/Conversation/selectAgent';
import CreateAgentPanel from '@/features/CreateAgent/CreateAgentPanel';
import type { FirstAgentCreationCheckpoint } from '@/services/agentOnboarding';

export interface OpenConnectAgentModalOptions {
  /** Idempotent create intent — pass when a retry must not mint a twin. */
  creationCheckpoint?: FirstAgentCreationCheckpoint;
  groupId?: string;
  /** Pre-picked harness (composer picker hand-off). */
  initialType?: HeterogeneousAgentType;
  onCreated?: (agentId: string, config?: Partial<AgentItem>) => Promise<void> | void;
  visibility?: 'private' | 'public';
}

const ConnectAgentContent = ({ onCreated, ...panelProps }: OpenConnectAgentModalOptions) => {
  const { close } = useModalContext();

  return (
    <CreateAgentPanel
      {...panelProps}
      onCreated={async (agentId, config) => {
        // Success leads to the result: land on the fresh agent's conversation.
        // A caller-supplied onCreated (e.g. the onboarding gate) takes over
        // the landing itself.
        if (onCreated) {
          await onCreated(agentId, config);
          close();
          return;
        }
        openNewConversation({ agentId });
        close();
      }}
    />
  );
};

/**
 * The unified agent-creation surface, hosted in a modal for sidebar/menu
 * entry points. The same panel renders inline on the onboarding gate — there
 * is exactly one create flow.
 */
export const openConnectAgentModal = (options?: OpenConnectAgentModalOptions): ModalInstance =>
  createModal({
    content: <ConnectAgentContent {...options} />,
    footer: null,
    maskClosable: true,
    styles: { content: { paddingBlockStart: 0 } },
    title: i18nT('createAgent.title', { ns: 'chat' }),
    width: 520,
  });
