'use client';

import type { BuiltinStreamingProps } from '@orvilo/types';
import { memo } from 'react';

import { Markdown } from '@/components/Markdown';

import type { SpeakParams } from '../../../types';

export const SpeakStreaming = memo<BuiltinStreamingProps<SpeakParams>>(({ args }) => {
  const { instruction } = args || {};

  if (!instruction) return null;

  return (
    <div className="rounded-(--radius-card) bg-fill-quaternary p-3">
      <div className="text-(length:--text-dense) text-muted-foreground">
        <Markdown animated streaming variant={'chat'}>
          {instruction}
        </Markdown>
      </div>
    </div>
  );
});

SpeakStreaming.displayName = 'SpeakStreaming';

export default SpeakStreaming;
