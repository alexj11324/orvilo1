'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { memo, useEffect } from 'react';

import { useGroupProfileStore } from '@/store/groupProfile';

import type { UpdateGroupPromptParams } from '../../../types';

export const UpdateGroupPromptStreaming = memo<BuiltinStreamingProps<UpdateGroupPromptParams>>(
  ({ args }) => {
    const { prompt } = args || {};
    const setActiveTabId = useGroupProfileStore((s) => s.setActiveTabId);

    // Switch to group tab when streaming group prompt
    useEffect(() => {
      setActiveTabId('group');
    }, []);

    if (!prompt) return null;

    return (
      <div className="w-full rounded-[var(--ant-border-radius)] border border-sidebar-border bg-card px-3 py-2">
        <Markdown animated variant={'chat'}>
          {prompt}
        </Markdown>
      </div>
    );
  },
);

UpdateGroupPromptStreaming.displayName = 'UpdateGroupPromptStreaming';

export default UpdateGroupPromptStreaming;
