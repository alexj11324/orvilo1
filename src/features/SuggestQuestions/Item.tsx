'use client';

import { cssVar } from 'antd-style';
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
        `flex flex-col border${disabled ? '' : ' hover:bg-[var(--ant-color-fill-tertiary)]'}`,
        CLICKABLE_FOCUS_RING,
      )}
      style={{
        borderColor: cssVar.colorBorderSecondary,
        background: cssVar.colorBgContainer,
        borderRadius: cssVar.borderRadiusLG,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.65 : undefined,
      }}
      onClick={handleClick}
    >
      <div className="flex flex-col gap-1 py-3 px-[14px]">
        <div className="truncate min-w-0 text-[14px]" style={{ fontWeight: 500 }}>
          {title}
        </div>
        <div className="line-clamp-2 text-[12px]" style={{ color: cssVar.colorTextTertiary }}>
          {description}
        </div>
      </div>
    </div>
  );
});

export default Item;
