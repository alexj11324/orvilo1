'use client';

import { Icon } from '@lobehub/ui';
import { Avatar } from '@lobehub/ui/base-ui';
import { McpIcon } from '@lobehub/ui/icons';
import { memo } from 'react';

import NavItem from '@/features/NavPanel/components/NavItem';

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
  <NavItem
    active={isSelected}
    title={title}
    icon={() =>
      avatar && avatar !== 'MCP_AVATAR' ? (
        <Avatar avatar={avatar} shape="square" size={18} />
      ) : (
        <Icon icon={McpIcon} size={18} />
      )
    }
    onClick={onSelect}
  />
));

McpSkillItem.displayName = 'McpSkillItem';

export default McpSkillItem;
