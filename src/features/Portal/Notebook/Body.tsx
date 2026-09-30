'use client';

import { BookOpenIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Spinner } from '@/components/ui/spinner';
import { useFetchNotebookDocuments } from '@/hooks/useFetchNotebookDocuments';
import { useChatStore } from '@/store/chat';

import SimpleEmpty from '../SimpleEmpty';
import DocumentItem from './DocumentItem';

const NotebookBody = memo(() => {
  const { t } = useTranslation('portal');
  const topicId = useChatStore((s) => s.activeTopicId);
  const { documents, isLoading } = useFetchNotebookDocuments(topicId);

  // Show message when no topic is selected
  if (!topicId) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 py-6">
        <SimpleEmpty description={t('notebook.empty')} icon={BookOpenIcon} />
      </div>
    );
  }

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center flex-1">
        <Spinner />
      </div>
    );
  }

  // Show empty state
  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 py-6">
        <SimpleEmpty description={t('notebook.empty')} icon={BookOpenIcon} />
      </div>
    );
  }

  // Render document list
  return (
    <div className="flex flex-col gap-2 h-[100%] px-3" style={{ overflow: 'auto' }}>
      {documents.map((doc) => (
        <DocumentItem document={doc} key={doc.id} topicId={topicId} />
      ))}
    </div>
  );
});

export default NotebookBody;
