'use client';

import { Avatar, Tag } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { GripVertical } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { SortableItemHandle } from '@/components/reui/sortable';
import { DEFAULT_AVATAR } from '@/const/meta';

const styles = createStaticStyles(({ css }) => ({
  title: css`
    overflow: hidden;
    flex: 1;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

interface MemberItemProps {
  avatar?: string;
  background?: string;
  disabled?: boolean;
  isExternal?: boolean;
  title: string;
}

const MemberItem = memo<MemberItemProps>(({ avatar, background, disabled, isExternal, title }) => {
  const { t } = useTranslation('chat');

  return (
    <>
      {!disabled && (
        <SortableItemHandle>
          <GripVertical size={14} />
        </SortableItemHandle>
      )}
      <Avatar
        emojiScaleWithBackground
        avatar={avatar || DEFAULT_AVATAR}
        background={background}
        size={24}
        style={{ flex: 'none' }}
      />
      <span className={styles.title}>{title}</span>
      {isExternal && (
        <Tag size={'small'} style={{ flexShrink: 0 }}>
          {t('group.profile.external')}
        </Tag>
      )}
    </>
  );
});

export default MemberItem;
