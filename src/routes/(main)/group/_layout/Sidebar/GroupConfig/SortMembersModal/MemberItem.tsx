'use client';

import { GripVertical } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import { Badge } from '@/components/reui/badge';
import { SortableItemHandle } from '@/components/reui/sortable';

const styles = {
  title: 'overflow-hidden flex-1 text-sm leading-5.5 text-ellipsis whitespace-nowrap',
};

interface MemberItemProps {
  disabled?: boolean;
  isCoordinator?: boolean;
  runtimeType?: string;
  title: string;
}

const MemberItem = memo<MemberItemProps>(({ runtimeType, disabled, isCoordinator, title }) => {
  const { t } = useTranslation('chat');

  return (
    <>
      {!disabled && (
        <SortableItemHandle className="inline-flex size-8 shrink-0 items-center justify-center rounded-(--radius-button)">
          <GripVertical className="size-4 shrink-0 text-foreground-quaternary" size={16} />
        </SortableItemHandle>
      )}
      <AgentRuntimeIcon size={24} type={runtimeType} />
      <span className={styles.title}>{title}</span>
      {isCoordinator && (
        <Badge className="shrink-0 text-xs leading-5 h-auto" variant="primary-light">
          {t('group.settings.coordinatorName')}
        </Badge>
      )}
    </>
  );
});

export default MemberItem;
