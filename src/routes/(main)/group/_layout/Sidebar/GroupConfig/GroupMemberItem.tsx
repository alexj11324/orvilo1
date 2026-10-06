'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import { Badge } from '@/components/reui/badge';
import NavItem from '@/features/NavPanel/components/NavItem';

interface GroupMemberItemProps {
  actions?: ReactNode;
  isCoordinator?: boolean;
  runtimeType?: string;
  title: string;
}

const GroupMemberItem = ({ title, runtimeType, actions, isCoordinator }: GroupMemberItemProps) => {
  const { t } = useTranslation('chat');
  return (
    <NavItem
      actions={actions}
      icon={<AgentRuntimeIcon size={24} type={runtimeType} />}
      title={
        <div className="flex min-w-0 items-center gap-1">
          <span className="truncate">{title}</span>
          {isCoordinator && (
            <Badge className="shrink-0" size="sm" variant="secondary">
              {t('group.settings.coordinatorName')}
            </Badge>
          )}
        </div>
      }
    />
  );
};

export default GroupMemberItem;
