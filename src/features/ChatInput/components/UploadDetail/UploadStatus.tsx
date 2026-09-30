import { cssVar } from 'antd-style';
import { CircleAlertIcon, CircleCheck, Loader2Icon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { type FileUploadState, type FileUploadStatus } from '@/types/files/upload';
import { formatSize } from '@/utils/format';

const CircleProgress = memo<{ percent: number; size: number }>(({ percent, size }) => {
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg height={size} width={size}>
      <circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke={cssVar.colorSplit}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        fill="none"
        r={radius}
        stroke={cssVar.colorPrimary}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - percent / 100)}
        strokeLinecap="round"
        strokeWidth={strokeWidth}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
});

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
          <span className="text-[12px] text-muted-foreground">
            {t('upload.preview.status.pending')}
          </span>
        </div>
      );
    }

    case 'uploading': {
      return (
        <div className="flex flex-row items-center gap-1">
          <CircleProgress percent={uploadState?.progress ?? 0} size={14} />
          <span className="text-[12px] text-muted-foreground">
            {formatSize(size * ((uploadState?.progress || 0) / 100), 0)}
          </span>
        </div>
      );
    }

    case 'processing': {
      return (
        <div className="flex flex-row items-center gap-1">
          <CircleProgress percent={uploadState?.progress ?? 0} size={14} />
          <span className="text-[12px] text-muted-foreground">{formatSize(size)}</span>
        </div>
      );
    }

    case 'success': {
      return (
        <div className="flex flex-row items-center gap-1">
          <CircleCheck size={12} style={{ color: cssVar.colorSuccess }} />
          <span className="text-[12px] text-muted-foreground">{formatSize(size)}</span>
        </div>
      );
    }

    case 'error': {
      return (
        <div className="flex flex-row items-center gap-1" style={{ minWidth: 0 }}>
          <span className="anticon" role="img" style={{ color: cssVar.colorError }}>
            <CircleAlertIcon fill={'transparent'} height={12} size={12} width={12} />
          </span>
          <span
            className="truncate block"
            style={{ color: cssVar.colorError, fontSize: 12, maxWidth: 110 }}
            title={error}
          >
            {error || t('upload.preview.status.error')}
          </span>
        </div>
      );
    }

    case 'cancelled': {
      return (
        <span className="text-[12px] text-muted-foreground">
          {t('upload.preview.status.cancelled')}
        </span>
      );
    }
  }
});

export default UploadStatus;
