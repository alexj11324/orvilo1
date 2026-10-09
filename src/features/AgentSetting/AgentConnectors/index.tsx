import { getActivePluginIds } from '@orvilo/types';
import { LinkIcon } from 'lucide-react';
import { memo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { Switch } from '@/components/ui/switch';
import { useToolStore } from '@/store/tool';
import { connectorSelectors } from '@/store/tool/slices/connector';

import { useStore } from '../store';

const AgentConnectors = memo(() => {
  const { t } = useTranslation('setting');

  const [userEnabledPlugins, toggleAgentPlugin] = useStore((s) => [
    getActivePluginIds(s.config.plugins),
    s.toggleAgentPlugin,
  ]);

  const connectors = useToolStore(connectorSelectors.connectorList);
  const fetchConnectors = useToolStore((s) => s.fetchConnectors);
  const isInit = useToolStore((s) => s.isConnectorsInit);

  useEffect(() => {
    if (!isInit) fetchConnectors();
  }, [isInit, fetchConnectors]);

  if (connectors.length === 0) {
    return (
      <div className="py-6 text-center text-muted-foreground">
        {t('agentConnectors.empty', 'No connectors connected yet. Go to Connectors to add one.')}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {connectors.map((connector) => {
        const isEnabled = userEnabledPlugins.includes(connector.identifier);
        const enabledCount = connector.tools.filter((t) => t.permission !== 'disabled').length;

        return (
          <div
            key={connector.id}
            style={{
              alignItems: 'center',
              borderRadius: 8,
              display: 'flex',
              gap: 10,
              padding: '10px 12px',
            }}
          >
            <LinkIcon size={16} style={{ flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{connector.name}</div>
              <div className="text-xs text-muted-foreground">
                {t('agentConnectors.toolCount', '{{count}} tools', { count: enabledCount })}
              </div>
            </div>
            <Switch
              checked={isEnabled}
              size="sm"
              onCheckedChange={() => toggleAgentPlugin(connector.identifier)}
            />
          </div>
        );
      })}
    </div>
  );
});

AgentConnectors.displayName = 'AgentConnectors';

export default AgentConnectors;
