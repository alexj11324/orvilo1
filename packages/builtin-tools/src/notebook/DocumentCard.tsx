'use client';

import { CopyButton, Markdown } from '@lobehub/ui';
import { ActionIcon, Button } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { Maximize2, Minimize2, NotebookText, PencilLine } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/slices/portal/selectors';

import type { NotebookDocument } from './types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    position: relative;

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
  expandButton: css`
    position: absolute;
    inset-block-end: 16px;
    inset-inline-start: 50%;
    transform: translateX(-50%);

    box-shadow: ${cssVar.boxShadow};
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
              size={'small'}
              title={t('builtins.orvilo-notebook.actions.copy')}
            />
            <ActionIcon
              icon={PencilLine}
              size={'small'}
              title={t('builtins.orvilo-notebook.actions.edit')}
              onClick={handleToggle}
            />
          </div>
        </TooltipProvider>
      </div>
      {/* Content */}
      <ScrollArea className={styles.content} style={{ maxHeight: 400 }}>
        <Markdown style={{ overflow: 'unset', paddingBottom: 40 }} variant={'chat'}>
          {document.content}
        </Markdown>
      </ScrollArea>

      {/* Floating expand/collapse button */}
      <Button
        className={styles.expandButton}
        icon={isExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        shape={'round'}
        type={'default'}
        onClick={handleToggle}
      >
        {isExpanded
          ? t('builtins.orvilo-notebook.actions.collapse')
          : t('builtins.orvilo-notebook.actions.expand')}
      </Button>
    </div>
  );
});

export default DocumentCard;
