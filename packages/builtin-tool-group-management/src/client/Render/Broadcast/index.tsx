'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import type { BroadcastParams } from '../../../types';

export const BroadcastRender = memo<BuiltinRenderProps<BroadcastParams>>(({ args }) => {
  const { instruction } = args || {};

  if (!instruction) return null;

  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--ant-color-fill-quaternary)] p-3">
      <div className="text-[13px] text-muted-foreground">
        <Markdown variant={'chat'}>{instruction}</Markdown>
      </div>
    </div>
  );
});

BroadcastRender.displayName = 'BroadcastRender';

export default BroadcastRender;
