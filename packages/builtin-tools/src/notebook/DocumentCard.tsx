'use client';
import { cn } from 'cn';
import { Maximize2, Minimize2, NotebookText, PencilLine } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import CopyButton from '@/components/CopyButton';
import { Markdown } from '@/components/Markdown';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/slices/portal/selectors';

import type { NotebookDocument } from './types';

const styles = {
  container:
    'relative w-full overflow-hidden rounded-(--radius-card) border border-divider bg-card',
  content: 'max-h-100 px-4 text-sm',
  expandButton: 'absolute start-1/2 inset-be-4 -translate-x-1/2',
  header: 'border-be border-divider p-4',
  icon: 'text-muted-foreground',
  title: 'line-clamp-1 text-sm font-medium text-foreground',
};

interface DocumentCardProps {
  document: NotebookDocument;
}

const DocumentCard = memo<DocumentCardProps>(({ document }) => {
  const { t } = useTranslation('plugin');
  const [portalDocumentId, openDocument, closeDocument] = useChatStore((s) => [
    chatPortalSelectors.portalDocumentId(s),
    s.openDocument,
    s.closeDocument,
  ]);

  const isExpanded = portalDocumentId === document.id;

  const handleToggle = () => {
    if (isExpanded) {
      closeDocument();
    } else {
      openDocument(document.id);
    }
  };

  return (
    <div className={cn('flex', 'flex-col', styles.container)}>
      {/* Header */}
      <div className={cn('flex', 'items-center', 'gap-2', styles.header)}>
        <NotebookText className={styles.icon} size={16} />
        <div className="flex flex-col flex-1">
          <div className={styles.title}>{document.title}</div>
        </div>
        <TooltipProvider>
          <div className="flex gap-1">
            <CopyButton
              content={document.content}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              title={t('builtins.orvilo-notebook.actions.copy')}
            />
            <ActionIcon
              icon={PencilLine}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              title={t('builtins.orvilo-notebook.actions.edit')}
              onClick={handleToggle}
            />
          </div>
        </TooltipProvider>
      </div>
      {/* Content */}
      <ScrollArea className={styles.content}>
        {/* Public style preserves content overflow against Markdown’s unlayered root rule. */}
        <Markdown
          className="pbe-14"
          fontSize={14}
          lineHeight={22 / 14}
          style={{ overflow: 'unset' }}
          variant={'chat'}
        >
          {document.content}
        </Markdown>
      </ScrollArea>

      {/* Floating expand/collapse button */}
      <Button
        className={styles.expandButton}
        size="compact"
        variant="outline"
        onClick={handleToggle}
      >
        {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}{' '}
        {isExpanded
          ? t('builtins.orvilo-notebook.actions.collapse')
          : t('builtins.orvilo-notebook.actions.expand')}
      </Button>
    </div>
  );
});

export default DocumentCard;
