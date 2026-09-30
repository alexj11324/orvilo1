'use client';

import type { BuiltinStreamingProps } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { FileTextIcon } from 'lucide-react';
import { memo } from 'react';

import BubblesLoading from '@/components/BubblesLoading';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import StreamingMarkdown from '@/components/StreamingMarkdown';

import type { CreateDocumentArgs } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    overflow: hidden;

    width: 100%;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: ${cssVar.colorBgContainer};
  `,
  header: css`
    padding-block: 10px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  icon: css`
    color: ${cssVar.colorPrimary};
  `,
  title: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    font-weight: 500;
    color: ${cssVar.colorText};
  `,
}));

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
