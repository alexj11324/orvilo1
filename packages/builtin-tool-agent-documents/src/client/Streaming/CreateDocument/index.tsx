'use client';

import type { BuiltinStreamingProps } from '@orvilo/types';
import { cn } from 'cn';
import { FileTextIcon } from 'lucide-react';
import { memo } from 'react';

import BubblesLoading from '@/components/BubblesLoading';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import StreamingMarkdown from '@/components/StreamingMarkdown';

import type { CreateDocumentArgs } from '../../../types';

const styles = {
  container: 'w-full overflow-hidden rounded-[16px] border border-sidebar-border bg-card',
  header: 'border-b border-sidebar-border px-3 py-2.5',
  icon: 'text-primary',
  title: 'line-clamp-1 font-medium text-foreground',
};

export const CreateDocumentStreaming = memo<BuiltinStreamingProps<CreateDocumentArgs>>(
  ({ args }) => {
    const { content, title } = args || {};

    if (!content && !title) return null;

    return (
      <div className={cn('flex', 'flex-col', styles.container)}>
        <div className={cn('flex', 'items-center', 'gap-2', styles.header)}>
          <FileTextIcon className={styles.icon} size={16} />
          <div className="flex flex-col flex-1">
            <div className={styles.title}>{title}</div>
          </div>
          <NeuralNetworkLoading size={20} />
        </div>
        {!content ? (
          <div className="flex flex-col py-4 px-3">
            <BubblesLoading />
          </div>
        ) : (
          <StreamingMarkdown>{content}</StreamingMarkdown>
        )}
      </div>
    );
  },
);

CreateDocumentStreaming.displayName = 'AgentDocumentsCreateDocumentStreaming';

export default CreateDocumentStreaming;
