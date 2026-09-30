import { CheckCircleFilled } from '@ant-design/icons';
import { Progress, Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import { CircleAlertIcon, Loader2Icon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { type FileUploadState, type FileUploadStatus } from '@/types/files/upload';
import { formatSize } from '@/utils/format';

interface UploadStateProps {
  error?: string;
  size: number;
  status: FileUploadStatus;
  uploadState?: FileUploadState;
}

const UploadStatus = memo<UploadStateProps>(({ error, status, size, uploadState }) => {
  const { t } = useTranslation('chat');

  switch (status) {
    default:
    case 'pending': {
      return (
        <div className="flex flex-row items-center gap-1">
          <span className="anticon animate-spin" role="img">
            <Loader2Icon fill={'transparent'} height={12} size={12} width={12} />
          </span>
          <Text style={{ fontSize: 12 }} type={'secondary'}>
            {t('upload.preview.status.pending')}
          </Text>
        </div>
      );
    }

    case 'uploading': {
      return (
        <div className="flex flex-row items-center gap-1">
          <Progress percent={uploadState?.progress ?? 0} size={14} type="circle" />
          <Text style={{ fontSize: 12 }} type={'secondary'}>
            {formatSize(size * ((uploadState?.progress || 0) / 100), 0)}
          </Text>
        </div>
      );
    }

    case 'processing': {
      return (
        <div className="flex flex-row items-center gap-1">
          <Progress percent={uploadState?.progress ?? 0} size={14} type="circle" />
          <Text style={{ fontSize: 12 }} type={'secondary'}>
            {formatSize(size)}
          </Text>
        </div>
      );
    }

    case 'success': {
      return (
        <div className="flex flex-row items-center gap-1">
          <CheckCircleFilled style={{ color: cssVar.colorSuccess, fontSize: 12 }} />
          <Text style={{ fontSize: 12 }} type={'secondary'}>
            {formatSize(size)}
          </Text>
        </div>
      );
    }

    case 'error': {
      return (
        <div className="flex flex-row items-center gap-1" style={{ minWidth: 0 }}>
          <span className="anticon" role="img" style={{ color: cssVar.colorError }}>
            <CircleAlertIcon fill={'transparent'} height={12} size={12} width={12} />
          </span>
          <Text
            ellipsis={{ tooltip: error }}
            style={{ color: cssVar.colorError, fontSize: 12, maxWidth: 110 }}
          >
            {error || t('upload.preview.status.error')}
          </Text>
        </div>
      );
    }

    case 'cancelled': {
      return (
        <Text style={{ fontSize: 12 }} type={'secondary'}>
          {t('upload.preview.status.cancelled')}
        </Text>
      );
    }
  }
});

export default UploadStatus;
