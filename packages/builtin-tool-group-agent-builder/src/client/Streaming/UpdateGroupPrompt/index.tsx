'use client';

import type { BuiltinStreamingProps } from '@orvilo/types';
import { memo, useEffect } from 'react';

import { Markdown } from '@/components/Markdown';
import { useGroupProfileStore } from '@/store/groupProfile';

import type { UpdateGroupPromptParams } from '../../../types';

export const UpdateGroupPromptStreaming = memo<BuiltinStreamingProps<UpdateGroupPromptParams>>(
  ({ args }) => {
    const { prompt } = args || {};
    const setActiveTabId = useGroupProfileStore((s) => s.setActiveTabId);

    // Switch to group tab when streaming group prompt
    useEffect(() => {
      setActiveTabId('group');
    }, [setActiveTabId]);

    if (!prompt) return null;

    return (
      <div className="w-full rounded-(--radius-card) border border-sidebar-border bg-card px-3 py-2">
        <Markdown animated streaming variant={'chat'}>
          {prompt}
        </Markdown>
      </div>
    );
  },
);

UpdateGroupPromptStreaming.displayName = 'UpdateGroupPromptStreaming';

export default UpdateGroupPromptStreaming;
