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

/** Reads the same selected agent as the existing selector; it never selects a model. */
export function AgentInfo() {
  const { t } = useTranslation('chat');
  const agentId = useAgentId();
  const config = useAgentStore(agentSelectors.getAgentConfigById(agentId));
  const meta = useAgentStore(agentSelectors.getAgentMetaById(agentId));
  if (!config) return null;
  const runtime = resolveAgentRuntimeType(config);

  return (
    <Agent data-ai-element="agent">
      <AgentHeader
        model={runtime === 'orvilo' ? config.model : runtime}
        name={meta.title || t('untitledAgent')}
      />
      {(meta.description || config.systemRole) && (
        <AgentContent className="max-h-64 overflow-auto">
          {meta.description && <p className="text-sm text-muted-foreground">{meta.description}</p>}
          {config.systemRole && <AgentInstructions>{config.systemRole}</AgentInstructions>}
        </AgentContent>
      )}
    </Agent>
  );
}
