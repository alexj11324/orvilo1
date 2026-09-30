'use client';

import { Avatar } from '@lobehub/ui/base-ui';
import { ArrowUpRight } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { useNavigateToAgent } from '@/hooks/useNavigateToAgent';

/**
 * Shown inside ConnectorDetail for agent-owned connectors, between
 * the description and the tool-permission list: which agent owns this connector,
 * plus a one-click jump to go use that agent.
 */
const AgentConnectorUsage = memo<{
  agentAvatar?: string | null;
  agentId: string;
  agentTitle?: string | null;
}>(({ agentId, agentTitle, agentAvatar }) => {
  const { t } = useTranslation('setting');
  const navigateToAgent = useNavigateToAgent();

  return (
    <div
      className={'flex min-w-0'}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        background: 'var(--ant-color-fill-quaternary)',
        borderRadius: 8,
        marginBottom: 16,
        padding: '10px 12px',
      }}
    >
      <div
        className={'flex min-w-0'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, overflow: 'hidden' }}
      >
        <Avatar avatar={agentAvatar || undefined} size={32} title={agentTitle || undefined} />
        <div className={'flex min-w-0'} style={{ flexDirection: 'column', overflow: 'hidden' }}>
          <span className={'text-muted-foreground'} style={{ fontSize: 12 }}>
            {t('agentConnectorUsage.label')}
          </span>
          <span className={'truncate'} style={{ fontSize: 14, fontWeight: 500 }}>
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
