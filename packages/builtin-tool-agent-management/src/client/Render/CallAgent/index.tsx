'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import { Markdown } from '@/components/Markdown';

import type { CallAgentParams } from '../../../types';

export const CallAgentRender = memo<BuiltinRenderProps<CallAgentParams>>(({ args }) => {
  const { instruction } = args || {};

  if (!instruction) return null;

  return (
    <div className="rounded-(--radius-card) bg-fill-quaternary p-3">
      <div className="text-(length:--text-dense) text-muted-foreground">
        <Markdown variant={'chat'}>{instruction}</Markdown>
      </div>
    </div>
  );
});

CallAgentRender.displayName = 'CallAgentRender';

export default CallAgentRender;
