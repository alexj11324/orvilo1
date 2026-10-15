'use client';

import { DownloadIcon } from 'lucide-react';
import { memo, useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import FileIcon from '@/components/FileIcon';
import { formatSize, formatSpeed, formatTime } from '@/utils/format';

import type { EditorFileUploadTracker } from './editorFileUploadTracker';
import { openFileDownload } from './fileDownload';

const styles = {
  card: 'cursor-pointer flex gap-3 items-center box-border w-full p-4 border border-divider rounded-(--radius-card) text-sm leading-5.5 text-foreground bg-card transition-[background-color] duration-(--orvilo-motion-mid) ease-[ease] hover:bg-accent hover:[&_[data-orvilo-file-download]]:opacity-100 focus-within:[&_[data-orvilo-file-download]]:opacity-100',
  download: 'shrink-0 opacity-0 transition-opacity duration-(--orvilo-motion-mid) ease-[ease]',
  info: 'overflow-hidden flex-1 min-w-0',
  name: 'truncate text-sm leading-5.5 font-medium text-foreground',
  progress:
    'absolute inset-be-0 inset-s-0 h-0.75 bg-primary transition-[width] duration-(--orvilo-motion-mid) ease-[ease-out]',
  progressTrack: 'absolute inset-be-0 inset-x-0 h-0.75 bg-muted',
  size: 'mbs-0.5 text-xs leading-5 text-foreground-tertiary',
  state:
    'flex gap-2 items-center p-4 border border-divider rounded-(--radius-card) text-sm leading-5.5 text-muted-foreground bg-card',
  uploadCard:
    'relative overflow-hidden flex gap-3 items-center box-border w-full p-4 border border-divider rounded-(--radius-card) text-sm leading-5.5 text-foreground bg-card',
  uploadMeta: 'truncate mbs-0.5 text-xs leading-5 text-foreground-tertiary',
};

interface FileNodeLike {
  fileUrl?: string;
  getKey?: () => string;
  message?: string;
  name: string;
  size?: number;
  status?: 'pending' | 'uploaded' | 'error';
}

interface LinearFileCardProps {
  node: FileNodeLike;
  uploadTracker?: EditorFileUploadTracker;
}

const subscribeToNoUpload = () => () => {};

export const LinearFileCard = memo<LinearFileCardProps>(({ node, uploadTracker }) => {
  const { t } = useTranslation(['editor', 'file']);

  const { fileUrl, message, name, size, status } = node;
  const nodeKey = uploadTracker ? node.getKey?.() : undefined;
  const upload = useSyncExternalStore(
    uploadTracker && nodeKey !== undefined ? uploadTracker.subscribe : subscribeToNoUpload,
    () => (uploadTracker && nodeKey !== undefined ? uploadTracker.getSnapshot(nodeKey) : undefined),
    () => undefined,
  );

  useEffect(() => {
    if (!uploadTracker || nodeKey === undefined) return;

    if (status !== 'pending') {
      uploadTracker.releaseNode(nodeKey);
      return;
    }

    uploadTracker.bindNode(nodeKey, name);
    return () => uploadTracker.releaseNode(nodeKey);
  }, [name, nodeKey, status, uploadTracker]);

  if (status === 'pending') {
    const uploadState = upload?.uploadState;
    const rawProgress = Math.max(0, Math.min(100, uploadState?.progress || 0));
    const progress =
      upload?.status === 'uploading' ? Math.min(99, Math.round(rawProgress)) : rawProgress;
    const fileSize = upload?.file.size || size;
    const statusText =
      upload?.status === 'processing' || upload?.status === 'success'
        ? t('file.processing')
        : upload?.status === 'uploading'
          ? t('file.uploadingProgress', { progress })
          : t('file.preparing');
    const details = [
      fileSize
        ? uploadState
          ? `${formatSize(fileSize * (rawProgress / 100))} / ${formatSize(fileSize)}`
          : formatSize(fileSize)
        : undefined,
      upload?.status === 'uploading' && uploadState?.speed
        ? formatSpeed(uploadState.speed)
        : undefined,
      upload?.status === 'uploading' && uploadState?.restTime
        ? t('file:uploadDock.body.item.restTime', { time: formatTime(uploadState.restTime) })
        : undefined,
    ].filter(Boolean);

    return (
      <div className={styles.uploadCard}>
        <FileIcon fileName={name} fileType={upload?.file.type} size={36} />
        <div className={styles.info}>
          <div className={styles.name}>{name}</div>
          <div className={styles.uploadMeta}>
            {[statusText, ...details].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div
          aria-label={statusText}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className={styles.progressTrack}
          role="progressbar"
        >
          <div className={styles.progress} style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className={styles.state}>{t('file.error', { message: message || 'Unknown error' })}</div>
    );
  }

  const onDownloadClick = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.stopPropagation();
    event.preventDefault();
    if (!fileUrl) return;
    openFileDownload(fileUrl);
  };

  return (
    <div className={styles.card}>
      <FileIcon fileName={name} size={36} />
      <div className={styles.info}>
        <div className={styles.name}>{name}</div>
        {typeof size === 'number' && size > 0 ? (
          <div className={styles.size}>{formatSize(size)}</div>
        ) : null}
      </div>
      <div className={styles.download} data-orvilo-file-download="">
        <ActionIcon
          aria-label={t('download', { ns: 'common' })}
          icon={DownloadIcon}
          size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
          variant={'filled'}
          onClick={onDownloadClick}
        />
      </div>
    </div>
  );
});

LinearFileCard.displayName = 'LinearFileCard';
