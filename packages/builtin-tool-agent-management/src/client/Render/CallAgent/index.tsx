'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import type { CallAgentParams } from '../../../types';

export const CallAgentRender = memo<BuiltinRenderProps<CallAgentParams>>(({ args }) => {
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

CallAgentRender.displayName = 'CallAgentRender';

export default CallAgentRender;
