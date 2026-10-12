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
  container:
    'relative w-full overflow-hidden rounded-(--radius-card) border border-divider bg-card',
  content: 'max-h-100 px-4 text-sm',
  expandButton: 'absolute start-1/2 inset-be-4 -translate-x-1/2',
  header: 'border-be border-divider p-4',
  icon: 'text-muted-foreground',
  title: 'line-clamp-1 text-sm font-medium text-foreground',
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
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              title={t('builtins.orvilo-notebook.actions.copy')}
            />
            {documentId && (
              <ActionIcon
                icon={PencilLine}
                size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
                title={t('builtins.orvilo-notebook.actions.edit')}
                onClick={handleToggle}
              />
            )}
          </div>
        </TooltipProvider>
      </div>
      <ScrollArea className={styles.content}>
        {/* Public style preserves content overflow against Markdown’s unlayered root rule. */}
        <Markdown
          className="pbe-14"
          fontSize={14}
          lineHeight={22 / 14}
          style={{ overflow: 'unset' }}
          variant={'chat'}
        >
          {content}
        </Markdown>
      </ScrollArea>

      {documentId && (
        <Button
          className={styles.expandButton}
          size="compact"
          variant="outline"
          onClick={handleToggle}
        >
          {isExpanded ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          {isExpanded
            ? t('builtins.orvilo-notebook.actions.collapse')
            : t('builtins.orvilo-notebook.actions.expand')}
        </Button>
      )}
    </div>
  );
});

export default DocumentCard;
