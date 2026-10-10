'use client';

import type { BuiltinStreamingProps } from '@orvilo/types';
import { cn } from 'cn';
import { ListChecksIcon } from 'lucide-react';
import { memo } from 'react';

import StreamingMarkdown from '@/components/StreamingMarkdown';

import type { CreatePlanParams } from '../../../types';

const styles = {
  container: 'overflow-hidden rounded-(--radius-card) border border-border p-3',
  description: 'text-[14px] text-muted-foreground',
  header: 'flex items-center gap-2 py-1',
  title: 'truncate text-[16px] font-medium text-foreground',
};

export const CreatePlanStreaming = memo<BuiltinStreamingProps<CreatePlanParams>>(({ args }) => {
  const { goal, description, context } = args || {};

  if (!goal) return null;

  return (
    <div className={cn('flex', 'flex-col', 'gap-2', styles.container)}>
      {/* Header */}
      <div className={styles.header}>
        <ListChecksIcon size={18} />
        <div className={`truncate ${styles.title}`}>{goal}</div>
      </div>

      {/* Description */}
      {description && <div className={`line-clamp-2 ${styles.description}`}>{description}</div>}

      {/* Context content - streaming with animation */}
      <StreamingMarkdown maxHeight={100}>{context}</StreamingMarkdown>
    </div>
  );
});

CreatePlanStreaming.displayName = 'CreatePlanStreaming';

export default CreatePlanStreaming;
