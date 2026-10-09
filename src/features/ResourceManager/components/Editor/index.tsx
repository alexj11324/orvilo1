'use client';

import { cssVar, useTheme } from 'antd-style';
import { t as i18nT } from 'i18next';
import { ArrowLeftIcon, DownloadIcon, InfoIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { createModal } from '@/components/Modal';
import { Skeleton } from '@/components/ui/skeleton';
import NavHeader from '@/features/NavHeader';
import { PageAgentProvider } from '@/features/PageEditor/PageAgentProvider';
import FileDetailComponent from '@/features/ResourceManager/FileDetail';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { fileManagerSelectors, useFileStore } from '@/store/file';
import { downloadFile } from '@/utils/client/downloadFile';

import FileContent from './FileContent';

interface FileEditorProps {
  onBack?: () => void;
}

const FILE_DETAIL_SKELETON_WIDTHS = ['80%', '60%', '40%', '70%', '70%'];
const FILE_DETAIL_SKELETON_WIDTHS_2 = ['50%', '60%'];

const FileDetailSkeleton = () => (
  <div className="flex flex-col gap-4">
    <div className="flex flex-col gap-2">
      {FILE_DETAIL_SKELETON_WIDTHS.map((width) => (
        <Skeleton className="h-4" key={width} style={{ width }} />
      ))}
    </div>
    <div className="flex flex-col gap-2">
      {FILE_DETAIL_SKELETON_WIDTHS_2.map((width) => (
        <Skeleton className="h-4" key={width} style={{ width }} />
      ))}
    </div>
  </div>
);

const FileDetailModalContent = memo(() => {
  const currentViewItemId = useResourceManagerStore((s) => s.currentViewItemId);
  const fromStore = useFileStore(fileManagerSelectors.getFileById(currentViewItemId));
  const useFetchKnowledgeItem = useFileStore((s) => s.useFetchKnowledgeItem);
  const { data: fromQuery } = useFetchKnowledgeItem(!fromStore ? currentViewItemId : undefined);
  const fileDetail = fromStore ?? fromQuery;
  return (
    <div className="flex flex-col" style={{ minHeight: 260 }}>
      {fileDetail ? (
        <FileDetailComponent {...fileDetail} showDownloadButton={false} showTitle={false} />
      ) : (
        <FileDetailSkeleton />
      )}
    </div>
  );
});

FileDetailModalContent.displayName = 'FileDetailModalContent';

const openFileDetailModal = () =>
  createModal({
    content: <FileDetailModalContent />,
    footer: null,
    maskClosable: true,
    title: i18nT('detail.basic.title', { ns: 'file' }),
    width: 400,
  });

const FileEditorCanvas = memo<FileEditorProps>(({ onBack }) => {
  const { t } = useTranslation(['common', 'file']);
  const theme = useTheme();

  const currentViewItemId = useResourceManagerStore((s) => s.currentViewItemId);

  const fromStore = useFileStore(fileManagerSelectors.getFileById(currentViewItemId));
  const useFetchKnowledgeItem = useFileStore((s) => s.useFetchKnowledgeItem);
  const { data: fromFetch } = useFetchKnowledgeItem(!fromStore ? currentViewItemId : undefined);
  const fileDetail = fromStore ?? fromFetch;

  return (
    <div className="flex flex-row h-[100%] w-[100%]" style={{ minHeight: 0 }}>
      <div className="flex flex-col flex-1 h-[100%]" style={{ minHeight: 0 }}>
        <NavHeader
          left={
            <div
              className="flex flex-row items-center gap-3"
              style={{ minHeight: 32, minWidth: 0, overflow: 'hidden' }}
            >
              <ActionIcon icon={ArrowLeftIcon} title={t('back')} onClick={onBack} />
              <span
                title={fileDetail?.name}
                style={{
                  color: theme.colorText,
                  fontSize: 14,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {fileDetail?.name}
              </span>
            </div>
          }
          right={
            <div className="flex flex-row gap-2">
              {fileDetail?.url && (
                <ActionIcon
                  icon={DownloadIcon}
                  title={t('download', { ns: 'common' })}
                  onClick={() => {
                    if (fileDetail?.url && fileDetail?.name) {
                      downloadFile(fileDetail.url, fileDetail.name);
                    }
                  }}
                />
              )}
              <ActionIcon aria-label={t('details')} icon={InfoIcon} onClick={openFileDetailModal} />
            </div>
          }
          style={{
            borderBottom: `1px solid ${cssVar.colorBorderSecondary}`,
          }}
          styles={{
            left: { flex: 1, minWidth: 0, overflow: 'hidden', padding: 0 },
          }}
        />
        <div className="flex flex-col flex-1" style={{ minHeight: 0, overflow: 'hidden' }}>
          <FileContent fileId={currentViewItemId} />
        </div>
      </div>
    </div>
  );
});

FileEditorCanvas.displayName = 'FileEditorCanvas';

/**
 * View or Edit a file
 *
 * It's a un-reusable component for business logic only.
 * So we depend on context, not props.
 */
const FileEditor = memo<FileEditorProps>(({ onBack }) => {
  return (
    <PageAgentProvider>
      <FileEditorCanvas onBack={onBack} />
    </PageAgentProvider>
  );
});

FileEditor.displayName = 'FileEditor';

export default FileEditor;
