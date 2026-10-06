'use client';

import { createStaticStyles } from 'antd-style';
import { GripVertical } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import AgentRuntimeIcon from '@/components/AgentRuntimeIcon';
import { Badge } from '@/components/reui/badge';
import { SortableItemHandle } from '@/components/reui/sortable';

const styles = createStaticStyles(({ css }) => ({
  title: css`
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

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
        <SortableItemHandle>
          <GripVertical size={14} />
        </SortableItemHandle>
      )}
      <AgentRuntimeIcon size={24} type={runtimeType} />
      <span className={styles.title}>{title}</span>
      {isCoordinator && (
        <Badge size="sm" style={{ flexShrink: 0 }} variant="primary-light">
          {t('group.settings.coordinatorName')}
        </Badge>
      )}
    </>
  );
});

export default MemberItem;
