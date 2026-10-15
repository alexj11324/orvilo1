'use client';

import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import { Markdown } from '@/components/Markdown';

import type { SpeakParams } from '../../../types';

export const SpeakRender = memo<BuiltinRenderProps<SpeakParams>>(({ args }) => {
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

SpeakRender.displayName = 'SpeakRender';

export default SpeakRender;
