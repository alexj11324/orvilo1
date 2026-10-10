'use client';

import { Markdown } from '@lobehub/ui';
import { cn } from 'cn';
import { FileTextIcon, Maximize2, Minimize2, PencilLine } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import CopyButton from '@/components/CopyButton';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/slices/portal/selectors';

const styles = {
  container: 'relative w-full overflow-hidden rounded-[16px] border border-sidebar-border bg-card',
  content: 'px-4 text-[14px]',
  expandButton:
    'absolute start-1/2 [inset-block-end:16px] -translate-x-1/2 shadow-[var(--ant-box-shadow)]',
  header: 'border-b border-sidebar-border px-3 py-2.5',
  icon: 'text-primary',
  title: 'line-clamp-1 font-medium text-foreground',
};

interface DocumentCardProps {
  content: string;
  documentId?: string;
  title: string;
}

const DocumentCard = memo<DocumentCardProps>(({ content, documentId, title }) => {
  const { t } = useTranslation('plugin');
  const [portalDocumentId, openDocument, closeDocument] = useChatStore((s) => [
    chatPortalSelectors.portalDocumentId(s),
    s.openDocument,
    s.closeDocument,
  ]);

  const isExpanded = !!documentId && portalDocumentId === documentId;

  const handleToggle = () => {
    if (!documentId) return;
    if (isExpanded) {
      closeDocument();
    } else {
      openDocument(documentId);
    }
  };

  return (
    <div className={cn('flex', 'flex-col', styles.container)}>
      <div className={cn('flex', 'items-center', 'gap-2', styles.header)}>
        <FileTextIcon className={styles.icon} size={16} />
        <div className="flex flex-col flex-1">
          <div className={styles.title}>{title}</div>
        </div>
        <TooltipProvider>
          <div className="flex gap-1">
            <CopyButton
              content={content}
              size={'small'}
              title={t('builtins.orvilo-notebook.actions.copy')}
            />
            {documentId && (
              <ActionIcon
                icon={PencilLine}
                size={'small'}
                title={t('builtins.orvilo-notebook.actions.edit')}
                onClick={handleToggle}
              />
            )}
          </div>
        </TooltipProvider>
      </div>
      <ScrollArea className={styles.content} style={{ maxHeight: 400 }}>
        <Markdown style={{ overflow: 'unset', paddingBottom: 40 }} variant={'chat'}>
          {content}
        </Markdown>
      </ScrollArea>

      {documentId && (
        <Button
          className={cn('rounded-full', styles.expandButton)}
          variant="outline"
          onClick={handleToggle}
        >
          {isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          {isExpanded
            ? t('builtins.orvilo-notebook.actions.collapse')
            : t('builtins.orvilo-notebook.actions.expand')}
        </Button>
      )}
    </div>
  );
});

export default DocumentCard;
