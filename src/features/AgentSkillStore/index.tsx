'use client';

import { t } from 'i18next';

import { createModal } from '@/components/Modal';

import AgentSkillStoreContent from './Content';

/** Open the agent-scoped "connect new tool" store for a specific agent. */
export const createAgentSkillStoreModal = (agentId: string) =>
  createModal({
    content: <AgentSkillStoreContent agentId={agentId} />,
    footer: null,
    title: t('settingAgent.agentTools.connectNewPickerTitle', { ns: 'setting' }),
    width: 'min(80%, 800px)',
  });
