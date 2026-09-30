import { Markdown } from '@lobehub/ui';
import { BoltIcon, FileIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import AsyncError from '@/components/AsyncError';
import Loading from '@/components/Loading/CircleLoading';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import FileNotFound from '@/features/FileNotFound';
import FileViewer from '@/features/FileViewer';
import { normalizeAsyncError } from '@/libs/swr/normalizeError';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { useFileStore } from '@/store/file';

enum FilePreviewTab {
  Chunk = 'chunk',
  File = 'file',
}

const NO_TOPIC_KEY = '__no_topic__';

const getDefaultTab = (chunkText?: string) =>
  chunkText ? FilePreviewTab.Chunk : FilePreviewTab.File;

const FilePreview = () => {
  const previewFileId = useChatStore(chatPortalSelectors.previewFileId);
  const chunkText = useChatStore(chatPortalSelectors.chunkText);
  const activeTopicId = useChatStore((s) => s.activeTopicId);
  const useFetchFileItem = useFileStore((s) => s.useFetchKnowledgeItem);
  const { t } = useTranslation('portal');

  const topicKey = activeTopicId ?? NO_TOPIC_KEY;
  const [tabByTopic, setTabByTopic] = useState<Record<string, FilePreviewTab>>({});
  const tab = tabByTopic[topicKey] ?? getDefaultTab(chunkText);
  const { data, error, isLoading, mutate } = useFetchFileItem(previewFileId);

  useEffect(() => {
    setTabByTopic((prev) => ({ ...prev, [topicKey]: getDefaultTab(chunkText) }));
  }, [chunkText, previewFileId, topicKey]);

  if (isLoading) return <Loading />;
  // The backend answers a deleted / access-revoked file with 404 (and a
  // resolved-nothing on some list paths) — both are terminal, not retryable.
  // Other failures offer Reload.
  if (error && normalizeAsyncError(error).status !== 404) {
    return (
      <div className="flex flex-col flex-1 p-4">
        <AsyncError error={error} variant={'block'} onRetry={() => void mutate()} />
      </div>
    );
  }
  if (error || !data) return <FileNotFound />;

  const showChunk = tab === FilePreviewTab.Chunk && !!chunkText;
  return (
    <div
      className="flex flex-col h-[100%] px-1"
      style={{ borderRadius: 4, overflow: 'hidden', paddingBlock: '0 4px' }}
    >
      {chunkText && (
        <Tabs
          value={tab}
          onValueChange={(key) =>
            setTabByTopic((prev) => ({ ...prev, [topicKey]: key as FilePreviewTab }))
          }
        >
          <TabsList className="flex w-full">
            <TabsTrigger className="flex-1" value={FilePreviewTab.Chunk}>
              <span className="anticon" role="img">
                <BoltIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
              </span>
              {t('FilePreview.tabs.chunk')}
            </TabsTrigger>
            <TabsTrigger className="flex-1" value={FilePreviewTab.File}>
              <span className="anticon" role="img">
                <FileIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
              </span>
              {t('FilePreview.tabs.file')}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {showChunk ? (
        <Markdown style={{ overflow: 'scroll', paddingInline: 8 }}>{chunkText}</Markdown>
      ) : (
        <div className="flex flex-col flex-1 py-2" style={{ overflow: 'scroll' }}>
          <FileViewer {...data} />
        </div>
      )}
    </div>
  );
};

export default FilePreview;
