'use client';

import { cn } from 'cn';
import { Trash2 } from 'lucide-react';
import { memo } from 'react';

import type { RemoveIdentityMemoryParams } from '../../types';
import { getRemoveIdentityViewModel } from './identityMemoryViewModel';
import { memoryCardStyles as styles } from './MemoryCardParts';

const localStyles = {
  id: 'font-mono text-xs leading-[inherit] text-(--ant-color-text-quaternary)',
  reason: 'text-[13px] leading-[1.6] text-muted-foreground',
};

export interface RemovedIdentityCardProps {
  data?: RemoveIdentityMemoryParams;
}

/**
 * A deletion has nothing left to show, so the card carries the one thing that still
 * matters after the fact: why the identity was dropped.
 */
export const RemovedIdentityCard = memo<RemovedIdentityCardProps>(({ data }) => {
  const { id, isEmpty, reason } = getRemoveIdentityViewModel(data);

  if (isEmpty) return null;

  return (
    <div className={cn('flex', 'flex-col', styles.container)}>
      <div className={cn('flex', 'items-center', 'gap-2', styles.header)}>
        <Trash2 size={14} />
        <div className="flex flex-col flex-1">
          <div className="text-[13px] font-medium">Identity removed</div>
        </div>
        {id && <span className={localStyles.id}>{id}</span>}
      </div>

      {reason && (
        <div className={cn('flex', 'flex-col', styles.content)}>
          <div className={localStyles.reason}>{reason}</div>
        </div>
      )}
    </div>
  );
});

RemovedIdentityCard.displayName = 'RemovedIdentityCard';

export default RemovedIdentityCard;
