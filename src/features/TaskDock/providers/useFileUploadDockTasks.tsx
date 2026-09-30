import isEqual from 'fast-deep-equal';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { FileUploadErrorActions } from '@/business/client/features/FileUploadErrorActions';
import FileIcon from '@/components/FileIcon';
import { fileManagerSelectors, useFileStore } from '@/store/file';
import type { UploadFileItem } from '@/types/files/upload';
import { formatSize, formatSpeed, formatTime } from '@/utils/format';

import type { DockTask, DockTaskStatus } from '../type';

const STATUS_MAP: Record<UploadFileItem['status'], DockTaskStatus> = {
  cancelled: 'cancelled',
  error: 'error',
  pending: 'pending',
  processing: 'running',
  success: 'success',
  uploading: 'running',
};

export const useFileUploadDockTasks = (): DockTask[] => {
  const { t } = useTranslation(['file', 'common']);
  const fileList = useFileStore(fileManagerSelectors.dockFileList, isEqual);
  const cancelUpload = useFileStore((s) => s.cancelUpload);
  const cancelUploads = useFileStore((s) => s.cancelUploads);
  const retryDockUpload = useFileStore((s) => s.retryDockUpload);
  const dispatchDockFileList = useFileStore((s) => s.dispatchDockFileList);

  const describe = useCallback(
    ({ error, file, status, uploadState }: UploadFileItem) => {
      const size = formatSize(file.size);

      switch (status) {
        case 'uploading': {
          const trailing = [
            uploadState?.speed ? formatSpeed(uploadState.speed) : '',
            uploadState?.restTime
              ? t('uploadDock.body.item.restTime', { time: formatTime(uploadState.restTime) })
              : '',
          ].filter(Boolean);

          return (
            <div className="text-muted-foreground" style={{ fontSize: 12 }}>
              {uploadState?.progress ? formatSize(file.size * (uploadState.progress / 100)) : '-'}/
              {size}
              {trailing.length === 0 ? '' : ' · ' + trailing.join(' · ')}
            </div>
          );
        }
        case 'pending': {
          return (
            <div className="text-muted-foreground" style={{ fontSize: 12 }}>
              {size} · {t('uploadDock.body.item.pending')}
              {uploadState?.progress ? ` ${uploadState.progress}%` : ''}
            </div>
          );
        }
        case 'processing': {
          return (
            <div className="text-muted-foreground" style={{ fontSize: 12 }}>
              {size} · {t('uploadDock.body.item.processing')}
            </div>
          );
        }
        case 'success': {
          return (
            <div className="text-muted-foreground" style={{ fontSize: 12 }}>
              {size} · {t('uploadDock.body.item.done')}
            </div>
          );
        }
        case 'error': {
          return (
            <div className="text-destructive" style={{ fontSize: 12 }}>
              {error || `${size} · ${t('uploadDock.body.item.error')}`}
            </div>
          );
        }
        case 'cancelled': {
          return (
            <div className="text-warning" style={{ fontSize: 12 }}>
              {size} · {t('uploadDock.body.item.cancelled')}
            </div>
          );
        }
      }
    },
    [t],
  );

  const cancelActiveUploads = useCallback(() => {
    cancelUploads(
      fileList
        .filter((item) => item.status === 'uploading' || item.status === 'pending')
        .map((item) => item.id),
    );
  }, [cancelUploads, fileList]);

  return useMemo(
    () =>
      fileList.map((item): DockTask => {
        const { errorCode, file, id, status, uploadState } = item;
        const active = status === 'uploading' || status === 'pending';

        return {
          // A file with its own remedy action keeps that action instead of a
          // bare retry — the remedy is what actually unblocks the upload.
          ...(status === 'error' && !errorCode ? { retry: () => void retryDockUpload(id) } : {}),
          ...(active ? { cancel: () => cancelUpload(id) } : {}),
          detail: describe(item),
          groupCancel: cancelActiveUploads,
          dismiss: () => dispatchDockFileList({ ids: [id], type: 'removeFiles' }),
          extra: errorCode ? <FileUploadErrorActions code={errorCode} /> : undefined,
          groupLabel: t('taskDock.group.upload', { ns: 'common' }),
          icon: <FileIcon fileName={file.name} fileType={file.type} size={30} />,
          id,
          progress: uploadState?.progress,
          status: STATUS_MAP[status],
          title: file.name,
        };
      }),
    [cancelActiveUploads, cancelUpload, describe, dispatchDockFileList, fileList, retryDockUpload],
  );
};
