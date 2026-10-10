'use client';

import { McpIcon } from '@lobehub/ui/icons';
import { getComposioAppByIdentifier, getOrviloSkillProviderById } from '@orvilo/const';
import { createElement, memo } from 'react';

import Avatar from '@/components/Avatar';
import { Badge } from '@/components/reui/badge';
import type { AgentBoundConnector } from '@/store/tool/slices/connector/types';

import ConnectorRow from './ConnectorRow';

/**
 * A row in the unified settings' "Agent Connectors" section.
 *
 * Rendered identically to the base connector rows (same ConnectorRow + the same brand
 * icon a base Composio/Orvilo connector of this identifier would show), so the
 * only visual difference is a tag naming the owning agent. Selectable — clicking
 * routes to the shared ConnectorDetail on the right, keyed by connector id to
 * avoid the identifier collision an agent connector can have with a base one.
 */
const AgentConnectorItem = memo<{
  connector: AgentBoundConnector;
  isSelected?: boolean;
  onSelect?: () => void;
}>(({ connector, isSelected, onSelect }) => {
  // Resolve the same brand icon a base connector of this identifier would use;
  // fall back to the generic MCP icon for custom/unknown connectors.
  const brand =
    getComposioAppByIdentifier(connector.identifier) ??
    getOrviloSkillProviderById(connector.identifier);

  const renderIcon = () => {
    if (brand) {
      const { icon, label } = brand;
      if (typeof icon === 'string') return <Avatar alt={label} avatar={icon} size={18} />;
      return createElement(icon, { fill: 'var(--foreground)', size: 18 });
    }
    return createElement(McpIcon, { size: 18 });
  };

  return (
    <ConnectorRow
      active={isSelected}
      icon={renderIcon()}
      tag={connector.agentTitle ? <Badge>{connector.agentTitle}</Badge> : undefined}
      title={brand?.label || connector.name || connector.identifier}
      onSelect={() => onSelect?.()}
    />
  );
});

AgentConnectorItem.displayName = 'AgentConnectorItem';

export default AgentConnectorItem;
