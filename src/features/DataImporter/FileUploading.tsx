import { Progress } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import React, { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { formatSpeed, formatTime } from '@/utils/format';

import DataLoading from './Loading';

interface FileUploadingProps {
  progress?: number;
  restTime?: number;
  speed?: number;
}

export const FileUploading = memo<FileUploadingProps>(({ progress = 0, speed = 0, restTime }) => {
  const { t } = useTranslation('common');

  return (
    <>
      <DataLoading />
      <div className="flex flex-col items-center gap-2 w-full">
        {t('importModal.uploading.desc')}
        <div className="flex flex-col flex-1 gap-2 w-full">
          <Progress showInfo percent={progress} strokeColor={cssVar.colorSuccess} />
          <div
            className="flex justify-between"
            style={{ color: cssVar.colorTextDescription, fontSize: 12 }}
          >
            <span>
              {t('importModal.uploading.restTime')}: {restTime ? formatTime(restTime) : '-'}
            </span>
            <span>
              {t('importModal.uploading.speed')}: {formatSpeed(speed * 1024)}
            </span>
          </div>
        </div>
      </div>
    </>
  );
});
