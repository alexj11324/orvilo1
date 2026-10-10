'use client';

import { cn } from 'cn';
import { memo } from 'react';

import Avatar from '@/components/Avatar';

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
      <div
        className={cn('flex items-center gap-3 py-3 px-3', styles.container)}
        style={{
          border: `1px solid var(--border)`,
          borderRadius: 'var(--ant-border-radius-lg)',
          height: '100%',
        }}
      >
        <Avatar
          avatar={avatar}
          background={backgroundColor || 'transparent'}
          shape={'square'}
          size={40}
          style={{ flex: 'none' }}
        />
        <div className="flex flex-col flex-1 gap-1" style={{ minWidth: 0, overflow: 'hidden' }}>
          <span className={styles.title}>{title}</span>
          {description && <span className={styles.description}>{description}</span>}
        </div>
      </div>
    );
  },
);

export default AgentItem;
