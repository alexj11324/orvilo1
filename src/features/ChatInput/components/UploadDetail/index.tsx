import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import FileParsingStatus from '@/components/FileParsingStatus';
import { type FileParsingTask } from '@/types/asyncTask';
import { type FileUploadState, type FileUploadStatus } from '@/types/files';

import UploadStatus from './UploadStatus';

const styles = createStaticStyles(({ css }) => ({
  status: css`
    padding-inline: 0;
    background: none;
  `,
}));

interface UploadDetailProps {
  error?: string;
  size: number;
  status: FileUploadStatus;
  tasks?: FileParsingTask;
  uploadState?: FileUploadState;
}

const UploadDetail = memo<UploadDetailProps>(({ error, uploadState, status, size, tasks }) => {
  const { t } = useTranslation('chat');

  return (
    <div className="flex flex-row items-center gap-2 h-[22px]">
      <UploadStatus error={error} size={size} status={status} uploadState={uploadState} />
      {!!tasks && Object.keys(tasks).length === 0 ? (
        <Text style={{ fontSize: 12 }} type={'secondary'}>
          {t('upload.preview.prepareTasks')}
        </Text>
      ) : (
        <div>
          <FileParsingStatus {...tasks} hideEmbeddingButton className={styles.status} />
        </div>
      )}
    </div>
  );
});

export default UploadDetail;
