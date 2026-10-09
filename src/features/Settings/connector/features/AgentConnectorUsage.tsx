'use client';

import { ArrowUpRight } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useNavigateToAgent } from '@/hooks/useNavigateToAgent';

/**
 * Shown inside ConnectorDetail for agent-owned connectors, between
 * the description and the tool-permission list: which agent owns this connector,
 * plus a one-click jump to go use that agent.
 */
const AgentConnectorUsage = memo<{
  agentId: string;
  agentTitle?: string | null;
}>(({ agentId, agentTitle }) => {
  const { t } = useTranslation('setting');
  const navigateToAgent = useNavigateToAgent();

  return (
    <div className="mb-4 flex min-w-0 flex-row items-center justify-between gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-row items-center gap-2.5 overflow-hidden">
        <AssigneeAvatar agentId={agentId} size={32} />
        <div className="flex min-w-0 flex-col overflow-hidden">
          <span className="text-xs text-muted-foreground">{t('agentConnectorUsage.label')}</span>
          <span className="truncate text-sm font-medium">
            {agentTitle || t('skillGroup.agentConnectors')}
          </span>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={() => navigateToAgent(agentId)}>
        {createElement(ArrowUpRight, { size: 14 })}
        {t('agentConnectorUsage.goToAgent')}
      </Button>
    </div>
  );
});

AgentConnectorUsage.displayName = 'AgentConnectorUsage';

export default AgentConnectorUsage;
