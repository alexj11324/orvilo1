'use client';

import { McpIcon } from '@lobehub/ui/icons';
import { createElement, memo } from 'react';

import Avatar from '@/components/Avatar';

import ConnectorRow from './ConnectorRow';

interface McpSkillItemProps {
  avatar?: string;
  isSelected?: boolean;
  onSelect: () => void;
  title: string;
}

/**
 * A row for an MCP plugin — community or the user's own legacy custom MCP — in
 * the Connector settings list. Tool-permission editing and the legacy-plugin
 * migration entry both live in the detail panel.
 */
const McpSkillItem = memo<McpSkillItemProps>(({ title, avatar, isSelected, onSelect }) => (
  <ConnectorRow
    active={isSelected}
    title={title}
    icon={
      avatar && avatar !== 'MCP_AVATAR' ? (
        <Avatar avatar={avatar} shape="square" size={18} />
      ) : (
        createElement(McpIcon, { size: 18 })
      )
    }
    onSelect={onSelect}
  />
));

McpSkillItem.displayName = 'McpSkillItem';

export default McpSkillItem;
