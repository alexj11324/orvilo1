'use client';

import { MaterialFileTypeIcon } from '@lobehub/ui';
import { createStaticStyles, cx } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';

import { Alert, AlertDescription } from '@/components/ui/alert';

import type { FileContentDetail } from '../../../types';

const styles = createStaticStyles(({ css, cssVar }) => ({
  cardBody: css`
    padding-block: 12px 8px;
    padding-inline: 16px;
  `,
  container: css`
    overflow: hidden;

    min-width: 360px;
    max-width: 360px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;
  `,
  description: css`
    margin-block: 0 4px !important;
    color: ${cssVar.colorTextTertiary};
  `,
  footer: css`
    padding-block: 8px;
    padding-inline: 16px;
    border-radius: 8px;

    text-align: center;

    background-color: ${cssVar.colorFillQuaternary};
  `,
  footerText: css`
    font-size: 12px !important;
    color: ${cssVar.colorTextTertiary} !important;
  `,
  icon: css`
    color: ${cssVar.colorTextSecondary};
  `,
  preview: css`
    overflow: hidden;

    max-height: 80px;
    padding: 8px;
    border-radius: 6px;

    line-height: 1.5;
  `,
  title: css`
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;

    margin-block-end: 0;
  `,
  titleRow: css`
    color: ${cssVar.colorText};
  `,
}));

interface FileCardProps {
  file: FileContentDetail;
}

const FileCard = memo<FileCardProps>(({ file }) => {
  if (file.error) {
    return (
      <div className={cx('flex flex-col gap-2', styles.container)}>
        <div className={cx('flex flex-col gap-2', styles.cardBody)}>
          <div className={cx('flex flex-row items-center gap-2', styles.titleRow)}>
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
    <div className={cx('flex flex-col justify-between', styles.container)}>
      <div className={cx('flex flex-col gap-2', styles.cardBody)}>
        <div className={cx('flex flex-row items-center gap-2', styles.titleRow)}>
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
          <div className={cx('flex gap-1', styles.footerText)}>
            <span>Chars</span>
            <span>{file.totalCharCount?.toLocaleString()}</span>
          </div>
          <div className={cx('flex gap-1', styles.footerText)}>
            <span>Lines</span>
            <span>{file.totalLineCount?.toLocaleString()}</span>
          </div>
        </div>
      </div>
    </div>
  );
});

export default FileCard;
