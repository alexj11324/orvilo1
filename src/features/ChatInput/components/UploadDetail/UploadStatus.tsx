import { CircleAlertIcon, CircleCheck } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Spinner } from '@/components/ui/spinner';
import { type FileUploadState, type FileUploadStatus } from '@/types/files/upload';
import { formatSize } from '@/utils/format';

interface UploadStateProps {
  error?: string;
  size: number;
  status: FileUploadStatus;
  uploadState?: FileUploadState;
}

const ProgressRing = ({ percent }: { percent: number }) => {
  const r = 5.5;
  const circumference = 2 * Math.PI * r;

  return (
    <svg aria-hidden height={14} viewBox="0 0 14 14" width={14}>
      <circle className="stroke-muted" cx={7} cy={7} fill="none" r={r} strokeWidth={2} />
      <circle
        className="stroke-primary"
        cx={7}
        cy={7}
        fill="none"
        r={r}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(Math.max(percent, 0), 100) / 100)}
        strokeLinecap="round"
        strokeWidth={2}
        transform="rotate(-90 7 7)"
      />
    </svg>
  );
};

const UploadStatus = memo<UploadStateProps>(({ error, status, size, uploadState }) => {
  const { t } = useTranslation('chat');

  switch (status) {
    default:
    case 'pending': {
      return (
        <div className="flex flex-row items-center gap-1">
          <Spinner className="size-3" />
          <div className="text-muted-foreground text-[12px]">
            {t('upload.preview.status.pending')}
          </div>
        </div>
      );
    }

    case 'uploading': {
      return (
        <div className="flex flex-row items-center gap-1">
          <ProgressRing percent={uploadState?.progress ?? 0} />
          <div className="text-muted-foreground text-[12px]">
            {formatSize(size * ((uploadState?.progress || 0) / 100), 0)}
          </div>
        </div>
      );
    }

    case 'processing': {
      return (
        <div className="flex flex-row items-center gap-1">
          <ProgressRing percent={uploadState?.progress ?? 0} />
          <div className="text-muted-foreground text-[12px]">{formatSize(size)}</div>
        </div>
      );
    }

    case 'success': {
      return (
        <div className="flex flex-row items-center gap-1">
          <CircleCheck className="text-success" size={12} />
          <div className="text-muted-foreground text-[12px]">{formatSize(size)}</div>
        </div>
      );
    }

    case 'error': {
      return (
        <div className="flex flex-row items-center gap-1" style={{ minWidth: 0 }}>
          <span className="anticon text-destructive" role="img">
            <CircleAlertIcon fill={'transparent'} height={12} size={12} width={12} />
          </span>
          <div className="truncate text-destructive text-[12px] max-w-[110px]" title={error}>
            {error || t('upload.preview.status.error')}
          </div>
        </div>
      );
    }

    case 'cancelled': {
      return (
        <div className="text-muted-foreground text-[12px]">
          {t('upload.preview.status.cancelled')}
        </div>
      );
    }
  }
});

export default UploadStatus;
