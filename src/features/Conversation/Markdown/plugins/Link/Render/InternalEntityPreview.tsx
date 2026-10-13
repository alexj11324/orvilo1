'use client';
import { Freeze } from '@lobehub/ui';
import { cn } from 'cn';
import { BotIcon, CheckSquareIcon, FileTextIcon } from 'lucide-react';
import { createElement, memo, type PropsWithChildren, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { ArticleSkeleton } from '@/components/Skeleton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useClientDataSWR } from '@/libs/swr';
import { agentService } from '@/services/agent';
import { documentService } from '@/services/document';
import { taskService } from '@/services/task';

import type { InternalLinkReference } from '../internalLink';

const styles = {
  content: 'min-w-0 w-full p-4',
  description: 'line-clamp-3 text-sm leading-5.5 text-muted-foreground',
  icon: 'grid size-9 flex-none place-items-center rounded-(--radius-card) text-muted-foreground bg-muted',
  title: 'truncate text-sm leading-5.5 font-semibold',
  type: 'text-xs leading-5 text-foreground-tertiary',
};

interface PreviewData {
  avatar?: string | null;
  backgroundColor?: string | null;
  description?: string | null;
  title?: string | null;
}

/**
 * One cache entry per entity, shared between the hover preview and the eager
 * title resolution on the link itself — whichever fires first warms the other.
 */
export const internalEntityPreviewKey = (reference: InternalLinkReference) => [
  'internal-entity-preview',
  reference.type,
  reference.pathname,
];

export const getPreviewData = async (
  reference: InternalLinkReference,
): Promise<PreviewData | null> => {
  switch (reference.type) {
    case 'agent': {
      return agentService.getAgentConfigById(reference.agentId);
    }
    case 'document': {
      const document = await documentService.getDocumentById(reference.documentId);
      return document
        ? {
            description: document.content,
            title: document.title || document.filename,
          }
        : null;
    }
    case 'task': {
      const result = await taskService.getDetail(reference.taskId);
      const task = result.data;
      return task
        ? {
            description: task.description || task.instruction,
            title: task.name || task.identifier,
          }
        : null;
    }
    case 'route': {
      return null;
    }
  }
};

interface InternalEntityPreviewProps extends PropsWithChildren {
  fallbackTitle: string;
  reference: Exclude<InternalLinkReference, { type: 'route' }>;
}

export const InternalEntityPreview = memo<InternalEntityPreviewProps>(
  ({ children, fallbackTitle, reference }) => {
    const { t } = useTranslation('chat');
    const [open, setOpen] = useState(false);
    const { data, isLoading } = useClientDataSWR(
      open ? internalEntityPreviewKey(reference) : null,
      () => getPreviewData(reference),
      { revalidateOnFocus: false },
    );

    const icon =
      reference.type === 'agent'
        ? BotIcon
        : reference.type === 'task'
          ? CheckSquareIcon
          : FileTextIcon;
    const typeLabel = t(`internalLink.preview.${reference.type}`);

    const content = isLoading ? (
      <div className={styles.content}>
        <ArticleSkeleton avatar rows={2} />
      </div>
    ) : (
      <div className={cn('flex flex-col gap-3', styles.content)}>
        <div className="flex items-center gap-3">
          {reference.type === 'agent' && data?.avatar ? (
            <Avatar
              avatar={data.avatar}
              background={data.backgroundColor ?? undefined}
              shape="square"
              size={36}
            />
          ) : (
            <span className={styles.icon}>{createElement(icon, { size: 16 })}</span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className={styles.type}>{typeLabel}</span>
            <span className={styles.title}>{data?.title || fallbackTitle}</span>
          </div>
        </div>
        {data?.description && (
          <div className={cn('text-sm', styles.description)}>{data.description}</div>
        )}
      </div>
    );

    return (
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger openOnHover delay={350} render={<span>{children}</span>} />
        <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] overflow-hidden p-0" side="top">
          {/* Disabling the SWR key clears data before the exit animation finishes. */}
          <Freeze frozen={!open}>{content}</Freeze>
        </PopoverContent>
      </Popover>
    );
  },
);

InternalEntityPreview.displayName = 'InternalEntityPreview';
