'use client';

import { Markdown } from '@lobehub/ui';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { FileTextIcon } from 'lucide-react';
import { memo } from 'react';

import CopyButton from '@/components/CopyButton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    overflow: hidden;

    width: 100%;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 16px;

    background: ${cssVar.colorBgContainer};
  `,
  content: css`
    padding-inline: 16px;
    font-size: 14px;
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

interface DocumentCardProps {
  content: string;
  title: string;
}

const DocumentCard = memo<DocumentCardProps>(({ content, title }) => (
  <div className={cn('flex', 'flex-col', styles.container)}>
    <div className={cn('flex', 'items-center', 'gap-2', styles.header)}>
      <FileTextIcon className={styles.icon} size={16} />
      <div className="flex flex-col flex-1">
        <div className={styles.title}>{title}</div>
      </div>
      <TooltipProvider>
        <CopyButton content={content} size={'small'} />
      </TooltipProvider>
    </div>
    <ScrollArea className={styles.content} style={{ maxHeight: 400 }}>
      <Markdown style={{ overflow: 'unset', paddingBottom: 16 }} variant={'chat'}>
        {content}
      </Markdown>
    </ScrollArea>
  </div>
));

export default DocumentCard;
