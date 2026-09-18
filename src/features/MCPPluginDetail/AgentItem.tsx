'use client';

import { Block, Flexbox } from '@lobehub/ui';
import { Avatar } from '@lobehub/ui/base-ui';
import { memo } from 'react';

import { itemStyles } from './style';

interface AgentItemProps {
  avatar?: string;
  backgroundColor?: string;
  description?: string;
  identifier?: string;
  title?: string;
}

const AgentItem = memo<AgentItemProps>(
  ({ avatar, title, description, identifier, backgroundColor }) => {
    const styles = itemStyles;

    if (!identifier || !title) return null;

    return (
      <Block
        horizontal
        align={'center'}
        className={styles.container}
        gap={12}
        paddingBlock={12}
        paddingInline={12}
        style={{ height: '100%' }}
        variant={'outlined'}
      >
        <Avatar
          avatar={avatar}
          background={backgroundColor || 'transparent'}
          shape={'square'}
          size={40}
          style={{ flex: 'none' }}
        />
        <Flexbox flex={1} gap={4} style={{ minWidth: 0, overflow: 'hidden' }}>
          <span className={styles.title}>{title}</span>
          {description && <span className={styles.description}>{description}</span>}
        </Flexbox>
      </Block>
    );
  },
);

export default AgentItem;
