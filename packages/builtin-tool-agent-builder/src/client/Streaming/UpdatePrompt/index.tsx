'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { memo } from 'react';

import type { UpdatePromptParams } from '../../../types';

export const UpdatePromptStreaming = memo<BuiltinStreamingProps<UpdatePromptParams>>(({ args }) => {
  const { prompt } = args || {};

  if (!prompt) return null;

  return (
    <div className="w-full rounded-[var(--ant-border-radius)] border border-sidebar-border bg-card py-2 px-3">
      <Markdown animated variant={'chat'}>
        {prompt}
      </Markdown>
    </div>
  );
});

UpdatePromptStreaming.displayName = 'UpdatePromptStreaming';

export default UpdatePromptStreaming;
