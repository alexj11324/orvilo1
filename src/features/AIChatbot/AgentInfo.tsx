'use client';

import { useTranslation } from 'react-i18next';

import {
  Agent,
  AgentContent,
  AgentHeader,
  AgentInstructions,
} from '@/components/ai-elements/agent';
import { useAgentId } from '@/features/ChatInput/hooks/useAgentId';
import { useAgentStore } from '@/store/agent';
import { agentSelectors } from '@/store/agent/selectors';
import { resolveAgentRuntimeType } from '@/utils/agentRuntimeIdentity';

import { hasAgentInfo } from './hasAgentInfo';

/**
 * The selected Agent's description and instructions; nothing renders without either.
 */
export function AgentInfo() {
  const { t } = useTranslation('chat');
  const agentId = useAgentId();
  const config = useAgentStore(agentSelectors.getAgentConfigById(agentId));
  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId));
  if (!config || !hasAgentInfo({ description: meta.description, systemRole: config.systemRole }))
    return null;
  const runtime = resolveAgentRuntimeType(config);

  return (
    <Agent data-ai-element="agent">
      <AgentHeader
        model={runtime === 'orvilo' ? config.model : runtime}
        name={meta.title || t('untitledAgent')}
      />
      <AgentContent className="max-h-64 overflow-auto">
        {meta.description && <p className="text-sm text-muted-foreground">{meta.description}</p>}
        {config.systemRole && <AgentInstructions>{config.systemRole}</AgentInstructions>}
      </AgentContent>
    </Agent>
  );
}
