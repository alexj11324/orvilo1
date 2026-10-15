'use client';

import { cn } from 'cn';
import { memo, useCallback } from 'react';

import { useChatStore } from '@/store/chat';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

interface ItemProps {
  description: string;
  disabled?: boolean;
  prompt: string;
  title: string;
}

const Item = memo<ItemProps>(({ title, description, disabled, prompt }) => {
  const mainInputEditor = useChatStore((s) => s.mainInputEditor);

  const handleClick = useCallback(() => {
    if (disabled) return;

    mainInputEditor?.instance?.setDocument('markdown', prompt);
    mainInputEditor?.focus();
  }, [disabled, prompt, mainInputEditor]);

  return (
    <div
      {...clickableProps()}
      className={cn(
        `flex flex-col border${disabled ? '' : ' hover:bg-muted'}`,
        CLICKABLE_FOCUS_RING,
      )}
      style={{
        borderColor: 'var(--divider)',
        background: 'var(--card)',
        borderRadius: 'var(--radius-overlay)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.65 : undefined,
      }}
      onClick={handleClick}
    >
      <div className="flex flex-col gap-1 py-3 px-3.5">
        <div className="truncate min-w-0 text-sm" style={{ fontWeight: 500 }}>
          {title}
        </div>
        <div className="line-clamp-2 text-xs" style={{ color: 'var(--foreground-tertiary)' }}>
          {description}
        </div>
      </div>
    </div>
  );
});

export default Item;
