'use client';

import { Center, Icon, Tooltip } from '@lobehub/ui';
import { Avatar, Button } from '@lobehub/ui/base-ui';
import { type McpPresetConnector } from '@orvilo/const';
import { cssVar } from 'antd-style';
import { CircleCheck, SquareArrowOutUpRight } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import NavItem from '@/features/NavPanel/components/NavItem';
import { usePermission } from '@/hooks/usePermission';
import type { ConnectorWithTools } from '@/store/tool/slices/connector/types';

interface McpPresetItemProps {
  /**
   * The custom connector already pointing at this preset's endpoint, when one
   * exists. Absent → the row offers a Connect button that opens the connector
   * form pre-filled with the preset's URL and auth.
   */
  connector?: ConnectorWithTools;
  isSelected?: boolean;
  onAdd: () => void;
  onSelect: () => void;
  preset: McpPresetConnector;
}

/**
 * A row for a curated hosted MCP server (GitHub, Linear, Notion, …) in the
 * Connector settings list. Unlike Orvilo/Composio providers these need no
 * market backend — Connect lands in the regular custom-connector OAuth flow —
 * so the row is available on every deployment.
 */
const McpPresetItem = memo<McpPresetItemProps>(
  ({ preset, connector, isSelected, onAdd, onSelect }) => {
    const { t } = useTranslation('setting');
    const { allowed: canCreate, reason: createReason } = usePermission('create_content');
    const { allowed: canEdit, reason: editReason } = usePermission('edit_own_content');

    const isAdded = Boolean(connector);

    const renderNavExtra = () => {
      if (isAdded) {
        return (
          <Tooltip title={t('tools.orviloSkill.connected', { defaultValue: 'Connected' })}>
            <Center width={20}>
              <Icon icon={CircleCheck} size={16} style={{ color: cssVar.colorSuccess }} />
            </Center>
          </Tooltip>
        );
      }
      return (
        <Tooltip title={!canCreate ? createReason : editReason}>
          <Button
            disabled={!canCreate || !canEdit}
            icon={<Icon icon={SquareArrowOutUpRight} />}
            size="small"
            type="text"
            onClick={onAdd}
          >
            {t('tools.orviloSkill.connect')}
          </Button>
        </Tooltip>
      );
    };

    const renderNavIcon = () => {
      const { icon, label } = preset;
      if (typeof icon === 'string') return <Avatar alt={label} avatar={icon} size={18} />;
      return <Icon fill={cssVar.colorText} icon={icon} size={18} />;
    };

    return (
      <NavItem
        active={isSelected}
        extra={renderNavExtra()}
        icon={renderNavIcon}
        title={preset.label}
        titleColor={!isAdded ? cssVar.colorTextDescription : undefined}
        // Same contract as OrviloSkillItem: only added connectors open the
        // detail panel; otherwise the inline Connect button is the affordance.
        onClick={isAdded ? onSelect : undefined}
      />
    );
  },
);

McpPresetItem.displayName = 'McpPresetItem';

export default McpPresetItem;
