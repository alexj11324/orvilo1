'use client';

import { COMPOSIO_APP_TYPES } from '@orvilo/const';
import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { serverConfigSelectors, useServerConfigStore } from '@/store/serverConfig';
import { useToolStore } from '@/store/tool';
import { connectorSelectors } from '@/store/tool/slices/connector';

import Item from './Item';
import { gridStyles } from './style';

/**
 * "Connect new tool" store for a single agent — a trimmed, agent-scoped mirror
 * of SkillStore's first (Orvilo) tab. v1 lists Composio connectors; "connected"
 * reflects the AGENT's own connectors, and connecting binds a fresh account to
 * the agent (agent_id). Orvilo-OAuth / custom-MCP tabs are intentionally left
 * out for now.
 */
const AgentSkillStoreContent = memo<{ agentId: string }>(({ agentId }) => {
  const { t } = useTranslation('setting');
  const isComposioEnabled = useServerConfigStore(serverConfigSelectors.enableComposio);
  const isInit = useToolStore(connectorSelectors.isAgentConnectorsInit(agentId));
  const fetchAgentConnectors = useToolStore((s) => s.fetchAgentConnectors);

  useEffect(() => {
    if (agentId && !isInit) fetchAgentConnectors(agentId);
  }, [agentId, isInit, fetchAgentConnectors]);

  return (
    <div className="flex flex-col gap-2 w-full" style={{ maxHeight: '75vh' }}>
      {isComposioEnabled ? (
        <div
          className="flex flex-col h-[496px]"
          style={{ marginBlockEnd: -12, marginInline: -16, overflow: 'auto' }}
        >
          <div className={gridStyles.grid}>
            {COMPOSIO_APP_TYPES.map((type) => (
              <Item
                agentId={agentId}
                appSlug={type.appSlug}
                description={type.description}
                icon={type.icon}
                identifier={type.identifier}
                key={type.identifier}
                label={type.label}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground" style={{ padding: 24 }}>
          {t('settingAgent.agentTools.pickerEmpty')}
        </div>
      )}
    </div>
  );
});

AgentSkillStoreContent.displayName = 'AgentSkillStoreContent';

export default AgentSkillStoreContent;
