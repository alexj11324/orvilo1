'use client';

import { MaterialFileTypeIcon } from '@lobehub/ui';
import { cn } from 'cn';
import { memo } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';

import type { FileContentDetail } from '../../../types';

const styles = {
  cardBody: '[padding-block-start:12px] [padding-block-end:8px] ps-4 pe-4',
  container:
    'overflow-hidden min-w-[360px] max-w-[360px] border border-sidebar-border rounded-[var(--radius-overlay)]',
  footer:
    'py-2 ps-4 pe-4 rounded-[var(--radius-card)] text-center bg-[var(--ant-color-fill-quaternary)]',
  footerText: 'text-xs leading-[inherit] text-[var(--ant-color-text-tertiary)]',
  preview: 'overflow-hidden max-h-20 p-2 rounded-[var(--radius-input)] leading-[1.5]',
  title: 'line-clamp-1 [margin-block-end:0]',
  titleRow: 'text-foreground',
};

interface FileCardProps {
  file: FileContentDetail;
}

const FileCard = memo<FileCardProps>(({ file }) => {
  if (file.error) {
    return (
      <div className={cn('flex flex-col gap-2', styles.container)}>
        <div className={cn('flex flex-col gap-2', styles.cardBody)}>
          <div className={cn('flex flex-row items-center gap-2', styles.titleRow)}>
            <MaterialFileTypeIcon
              filename={file.filename}
              size={16}
              type={'file'}
              variant={'raw'}
            />
            <div className={styles.title}>{file.filename}</div>
          </div>
        </div>
        <div className={styles.footer}>
          <Alert variant="destructive">
            <AlertDescription>{file.error}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col justify-between', styles.container)}>
      <div className={cn('flex flex-col gap-2', styles.cardBody)}>
        <div className={cn('flex flex-row items-center gap-2', styles.titleRow)}>
          <MaterialFileTypeIcon filename={file.filename} size={16} type={'file'} variant={'raw'} />
          <div className={styles.title}>{file.filename}</div>
        </div>
        {file.preview && (
          <span
            className={cn(
              'font-mono',
              'rounded',
              'bg-muted',
              'px-1',
              'line-clamp-4',
              'text-[12px]',
              'text-muted-foreground',
              styles.preview,
            )}
          >
            {file.preview}...
          </span>
        )}
      </div>
      <div className={styles.footer}>
        <div className="flex gap-6">
          <div className={cn('flex gap-1', styles.footerText)}>
            <span>Chars</span>
            <span>{file.totalCharCount?.toLocaleString()}</span>
          </div>
          <div className={cn('flex gap-1', styles.footerText)}>
            <span>Lines</span>
            <span>{file.totalLineCount?.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default FileCard;
