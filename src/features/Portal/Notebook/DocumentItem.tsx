import { type NotebookDocument } from '@orvilo/types';
import { cn } from 'cn';
import { FileTextIcon, Trash2Icon } from 'lucide-react';
import { type MouseEvent } from 'react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { confirmModal } from '@/components/Modal';
import { useChatStore } from '@/store/chat';
import { useNotebookStore } from '@/store/notebook';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const styles = {
  container: 'cursor-pointer p-3 rounded-(--radius-card) bg-muted hover:bg-selected',
  description: 'text-xs leading-5 text-muted-foreground',
  title: 'text-sm leading-5.5 font-medium',
};

interface DocumentItemProps {
  document: NotebookDocument;
  topicId: string;
}

const DocumentItem = memo<DocumentItemProps>(({ document, topicId }) => {
  const { t } = useTranslation('portal');
  const [deleting, setDeleting] = useState(false);

  const openDocument = useChatStore((s) => s.openDocument);
  const deleteDocument = useNotebookStore((s) => s.deleteDocument);

  const handleClick = () => {
    openDocument(document.id);
  };

  const handleDelete = async (e: MouseEvent) => {
    e.stopPropagation();

    confirmModal({
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeleting(true);
        try {
          await deleteDocument(document.id, topicId);
        } finally {
          setDeleting(false);
        }
      },
      title: t('notebook.confirmDelete'),
    });
  };

  return (
    <div
      {...clickableProps()}
      className={cn('flex flex-row gap-2', styles.container, CLICKABLE_FOCUS_RING)}
      onClick={handleClick}
    >
      <FileTextIcon size={16} />
      <div className="flex flex-col gap-1" style={{ flex: 1, minWidth: 0 }}>
        <div className="flex flex-row items-center justify-between">
          <div className={cn('truncate min-w-0', styles.title)}>{document.title}</div>
          <ActionIcon
            icon={Trash2Icon}
            loading={deleting}
            size={{ blockSize: 24, borderRadius: 6, size: 14 }}
            title={t('notebook.delete')}
            onClick={handleDelete}
          />
        </div>
        {document.description && (
          <div className={cn('line-clamp-2', styles.description)}>{document.description}</div>
        )}
      </div>
    </div>
  );
});

export default DocumentItem;
