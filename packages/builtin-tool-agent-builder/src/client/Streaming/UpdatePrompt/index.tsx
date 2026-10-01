'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { cssVar } from 'antd-style';
import { memo } from 'react';

import type { UpdatePromptParams } from '../../../types';

export const UpdatePromptStreaming = memo<BuiltinStreamingProps<UpdatePromptParams>>(({ args }) => {
  const { prompt } = args || {};

  if (!prompt) return null;

  return (
    <div
      className="py-2 px-3"
      style={{
        background: cssVar.colorBgContainer,
        border: `1px solid ${cssVar.colorBorderSecondary}`,
        borderRadius: cssVar.borderRadius,
        width: '100%',
      }}
    >
      <Markdown animated variant={'chat'}>
        {prompt}
      </Markdown>
    </div>
  );
});

UpdatePromptStreaming.displayName = 'UpdatePromptStreaming';

export default UpdatePromptStreaming;
