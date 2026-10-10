'use client';

import { Markdown } from '@lobehub/ui';
import type { BuiltinStreamingProps } from '@orvilo/types';
import { memo } from 'react';

import type { CallSubAgentParams } from '../../../types';

const styles = {
  container: 'rounded-(--radius-card) bg-(--ant-color-fill-quaternary) p-3',
  description: 'mb-2 font-medium text-foreground',
  instruction: 'text-[13px] text-muted-foreground',
};

export const CallSubAgentStreaming = memo<BuiltinStreamingProps<CallSubAgentParams>>(({ args }) => {
  const { instruction } = args || {};

  if (!instruction) return null;

  return (
    <div className={styles.container}>
      {instruction && (
        <div className={styles.instruction}>
          <Markdown animated variant={'chat'}>
            {instruction}
          </Markdown>
        </div>
      )}
    </div>
  );
});

CallSubAgentStreaming.displayName = 'CallSubAgentStreaming';

export default CallSubAgentStreaming;
