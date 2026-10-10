'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { memo } from 'react';

import type { SpeakParams } from '../../../types';

export const SpeakStreaming = memo<BuiltinStreamingProps<SpeakParams>>(({ args }) => {
  const { instruction } = args || {};

  if (!instruction) return null;

  return (
    <div className="rounded-[var(--radius-card)] bg-[var(--ant-color-fill-quaternary)] p-3">
      <div className="text-[13px] text-muted-foreground">
        <Markdown animated variant={'chat'}>
          {instruction}
        </Markdown>
      </div>
    </div>
  );
});

SpeakStreaming.displayName = 'SpeakStreaming';

export default SpeakStreaming;
