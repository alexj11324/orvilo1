'use client';

import { Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { memo, useCallback } from 'react';

import { useChatStore } from '@/store/chat';

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
      className={`flex flex-col border${disabled ? '' : ' hover:bg-[var(--ant-color-fill-tertiary)]'}`}
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
        <Text ellipsis fontSize={14} style={{ fontWeight: 500 }}>
          {title}
        </Text>
        <Text color={cssVar.colorTextTertiary} ellipsis={{ rows: 2 }} fontSize={12}>
          {description}
        </Text>
      </div>
    </div>
  );
});

export default Item;
