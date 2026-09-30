'use client';

import dayjs from 'dayjs';
import { BoltIcon, DownloadIcon } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Badge } from '@/components/reui/badge';
import { Separator } from '@/components/ui/separator';
import { type FileListItem } from '@/types/files';
import { downloadFile } from '@/utils/client/downloadFile';
import { formatSize } from '@/utils/format';

const descriptionRowStyle: CSSProperties = { width: 120 };

const DescriptionRows = ({
  items,
}: {
  items: { children?: ReactNode; key: string; label?: ReactNode }[];
}) => (
  <div className="flex flex-col gap-1">
    {items.map((item) => (
      <div className="flex flex-row items-center text-sm" key={item.key}>
        <span className="text-muted-foreground" style={descriptionRowStyle}>
          {item.label}
        </span>
        <span>{item.children}</span>
      </div>
    ))}
  </div>
);

interface FileDetailProps extends FileListItem {
  showDownloadButton?: boolean;
  showTitle?: boolean;
}

const FileDetail = memo<FileDetailProps>((props) => {
  const {
    name,
    embeddingStatus,
    size,
    createdAt,
    updatedAt,
    chunkCount,
    url,
    showDownloadButton = true,
    showTitle = true,
  } = props || {};
  const { t } = useTranslation('file');

  if (!props) return null;

  const items = [
    { children: name, key: 'name', label: t('detail.basic.filename') },
    { children: formatSize(size), key: 'size', label: t('detail.basic.size') },
    {
      children: name.split('.').pop()?.toUpperCase(),
      key: 'type',
      label: t('detail.basic.type'),
    },

    {
      children: dayjs(createdAt).format('YYYY-MM-DD HH:mm'),
      key: 'createdAt',
      label: t('detail.basic.createdAt'),
    },
    {
      children: dayjs(updatedAt).format('YYYY-MM-DD HH:mm'),
      key: 'updatedAt',
      label: t('detail.basic.updatedAt'),
    },
  ];

  const dataItems = [
    {
      children: chunkCount ? (
        <Badge variant="secondary">
          <span className="anticon" role="img">
            <BoltIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
          </span>{' '}
          {chunkCount}
        </Badge>
      ) : (
        t('detail.data.noChunk')
      ),
      key: 'chunkCount',
      label: t('detail.data.chunkCount'),
    },
    {
      children: (
        <Badge
          variant={
            embeddingStatus === 'success'
              ? 'success-light'
              : embeddingStatus === 'error'
                ? 'destructive-light'
                : embeddingStatus === 'warning'
                  ? 'warning-light'
                  : embeddingStatus === 'processing'
                    ? 'info-light'
                    : 'secondary'
          }
        >
          {t(`detail.data.embedding.${embeddingStatus || 'default'}`)}
        </Badge>
      ),
      key: 'embeddingStatus',
      label: t('detail.data.embeddingStatus'),
    },
  ];

  return (
    <div className="flex flex-col">
      {showTitle || (showDownloadButton && url) ? (
        <div className="flex flex-row items-center justify-between">
          {showTitle ? <span className="font-medium">{t('detail.basic.title')}</span> : <span />}
          {showDownloadButton && url ? (
            <ActionIcon
              icon={DownloadIcon}
              title={t('download', { ns: 'common' })}
              onClick={() => {
                downloadFile(url, name);
              }}
            />
          ) : null}
        </div>
      ) : null}
      <DescriptionRows items={items} />
      <Separator />
      <DescriptionRows items={dataItems} />
    </div>
  );
});

export default FileDetail;
