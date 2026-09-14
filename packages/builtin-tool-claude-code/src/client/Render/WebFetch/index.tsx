'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinRenderProps } from '@orvilo/types';
import { memo } from 'react';

import type { WebFetchArgs } from '../../../types';

const WebFetch = memo<BuiltinRenderProps<WebFetchArgs>>(({ content }) => {
  if (!content) return null;

  return (
    <Markdown style={{ maxHeight: 240, overflow: 'auto' }} variant={'chat'}>
      {content}
    </Markdown>
  );
});

WebFetch.displayName = 'ClaudeCodeWebFetch';

export default WebFetch;
