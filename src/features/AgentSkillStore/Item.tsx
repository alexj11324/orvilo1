'use client';

import { cssVar } from 'antd-style';
import { Loader2, MoreVerticalIcon, Plus, Unplug } from 'lucide-react';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { confirmModal } from '@/components/Modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePermission } from '@/hooks/usePermission';

import { itemStyles } from './style';
import { useAgentComposioConnect } from './useAgentComposioConnect';

interface ItemProps {
  agentId: string;
  appSlug: string;
  description?: string;
  icon: string | React.ComponentType;
  identifier: string;
  label: string;
}

/**
 * Agent-scoped Composio connector card — mirrors SkillStore's Orvilo Item but
 * its connected state + connect/disconnect are bound to the agent, not the user.
 */
const Item = memo<ItemProps>(({ agentId, appSlug, description, icon, identifier, label }) => {
  const { t } = useTranslation('setting');
  const styles = itemStyles;
  const { allowed: canCreate } = usePermission('create_content');
  const { allowed: canEdit } = usePermission('edit_own_content');

  const { handleConnect, handleDisconnect, isConnected, isConnecting } = useAgentComposioConnect({
    agentId,
    appSlug,
    identifier,
    label,
  });

  const localizedDescription = t(`tools.composio.servers.${identifier}.description` as any, {
    defaultValue: description ?? '',
  });

  const confirmDisconnect = () => {
    if (!canEdit) return;
    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: t('settingAgent.agentTools.removeOwnedConfirm'),
      okButtonProps: { danger: true },
      okText: t('tools.orviloSkill.disconnect'),
      onOk: handleDisconnect,
    });
  };

  const renderIcon = () => {
    if (typeof icon === 'string') return <img alt={label} height={40} src={icon} width={40} />;
    return React.createElement(icon as React.ComponentType<{ fill?: string; size?: number }>, {
      fill: cssVar.colorText,
      size: 40,
    });
  };

  const renderAction = () => {
    if (isConnecting) return <ActionIcon loading icon={Loader2} />;
    if (isConnected) {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<ActionIcon disabled={!canEdit} icon={MoreVerticalIcon} />}
          />
          <DropdownMenuContent align={'end'}>
            <DropdownMenuItem
              disabled={!canEdit}
              variant={'destructive'}
              onClick={confirmDisconnect}
            >
              <Unplug />
              {t('tools.orviloSkill.disconnect')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }
    return (
      <ActionIcon
        disabled={!canCreate || !canEdit}
        icon={Plus}
        title={t('tools.orviloSkill.connect')}
        onClick={() => {
          if (!canCreate || !canEdit) return;
          handleConnect();
        }}
      />
    );
  };

  return (
    <div
      className={`flex items-center gap-3 rounded-md border border-border ${styles.container}`}
      style={{ paddingBlock: 12, paddingInline: 12 }}
    >
      {renderIcon()}
      <div className="flex flex-col flex-1 gap-1" style={{ minWidth: 0, overflow: 'hidden' }}>
        <span className={styles.title}>{label}</span>
        {localizedDescription && <span className={styles.description}>{localizedDescription}</span>}
      </div>
      <div onClick={(event) => event.stopPropagation()}>{renderAction()}</div>
    </div>
  );
});

Item.displayName = 'AgentSkillStoreItem';

export default Item;
