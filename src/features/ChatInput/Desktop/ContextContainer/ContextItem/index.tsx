import { cn } from 'cn';
import { CircleAlertIcon, CircleCheckIcon, RotateCwIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { FileUploadErrorActions } from '@/business/client/features/FileUploadErrorActions';
import ActionIcon from '@/components/ActionIcon';
import {
  Attachment,
  AttachmentHoverCard,
  AttachmentHoverCardContent,
  AttachmentHoverCardTrigger,
  AttachmentInfo,
  AttachmentPreview,
  AttachmentRemove,
} from '@/components/ai-elements/attachments';
import FileIcon from '@/components/FileIcon';
import { Spinner } from '@/components/ui/spinner';
import { useEventCallback } from '@/hooks/useEventCallback';
import { useFileStore } from '@/store/file';
import { type UploadFileItem } from '@/types/files/upload';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import UploadDetail from '../../../components/UploadDetail';
import { openFilePreviewModal } from './FilePreviewModal.loader';
import { useUploadCompletion } from './useUploadCompletion';
import { getFileBasename, getUploadChipSize, getUploadChipState } from './utils';

type FileItemProps = UploadFileItem;

const ContextItem = memo<FileItemProps>((props) => {
  const { error, errorCode, file, id, previewUrl, status, tasks, uploadState } = props;
  const { t } = useTranslation(['chat', 'common']);
  const removeChatUploadFile = useFileStore((s) => s.removeChatUploadFile);
  const retryChatUploadFile = useFileStore((s) => s.retryChatUploadFile);
  const { busy, canPreview, canRetry, indicator, progress } = getUploadChipState(props);
  const basename = getFileBasename(file.name);
  const sizeLabel = getUploadChipSize(props);
  const showCompletion = useUploadCompletion(status);

  const handleClick = useEventCallback(() => {
    if (canPreview) void openFilePreviewModal(props);
  });
  const handleClose = useEventCallback(() => {
    void removeChatUploadFile(id);
  });

  const detail = (
    <div className="flex flex-col gap-1">
      <span>{file.name}</span>
      {status === 'error' && error ? (
        <div className="flex flex-row items-start gap-1 text-destructive">
          <div className="flex flex-col items-center justify-center" style={{ height: '1lh' }}>
            <span className="anticon" role="img">
              <CircleAlertIcon fill={'transparent'} height={12} size={12} width={12} />
            </span>
          </div>
          <span>{error}</span>
        </div>
      ) : (
        <UploadDetail size={file.size} status={status} tasks={tasks} uploadState={uploadState} />
      )}
    </div>
  );

  return (
    <AttachmentHoverCard>
      <AttachmentHoverCardTrigger
        render={
          <Attachment
            aria-busy={busy}
            className="max-w-full"
            data={{
              type: 'file',
              id,
              filename: basename,
              mediaType: file.type,
              url: previewUrl ?? '',
            }}
            onRemove={handleClose}
          >
            <div
              {...clickableProps(canPreview)}
              className={cn('flex min-w-0 flex-1 items-center gap-1.5', CLICKABLE_FOCUS_RING)}
              onClick={canPreview ? handleClick : undefined}
            >
              <AttachmentPreview
                fallbackIcon={<FileIcon fileName={file.name} fileType={file.type} size={16} />}
              />
              <AttachmentInfo />
              {(indicator !== 'file' || showCompletion) && (
                <div className="flex size-3 shrink-0 items-center justify-center">
                  {showCompletion ? (
                    <span
                      aria-label={t('upload.preview.status.success')}
                      className="anticon text-success"
                      role="img"
                    >
                      <CircleCheckIcon fill={'transparent'} height={12} size={12} width={12} />
                    </span>
                  ) : indicator === 'loading' ? (
                    <Spinner
                      className="size-3"
                      aria-label={t(
                        status === 'processing'
                          ? 'upload.preview.status.processing'
                          : status === 'pending'
                            ? 'upload.preview.status.pending'
                            : 'upload.preview.status.uploading',
                      )}
                    />
                  ) : indicator === 'progress' ? (
                    <span
                      aria-label={t('upload.preview.status.uploading')}
                      aria-valuemax={100}
                      aria-valuemin={0}
                      aria-valuenow={progress}
                      className="flex size-3 shrink-0 items-center justify-center"
                      role={'progressbar'}
                    >
                      <svg aria-hidden="true" height={12} viewBox={'0 0 12 12'} width={12}>
                        <circle
                          cx={6}
                          cy={6}
                          fill={'none'}
                          r={5}
                          stroke="var(--selected)"
                          strokeWidth={2}
                        />
                        <circle
                          cx={6}
                          cy={6}
                          fill={'none'}
                          r={5}
                          stroke="var(--primary)"
                          strokeDasharray={2 * Math.PI * 5}
                          strokeLinecap={'round'}
                          strokeWidth={2}
                          transform={'rotate(-90 6 6)'}
                          strokeDashoffset={
                            2 * Math.PI * 5 * (1 - Math.min(100, Math.max(0, progress ?? 0)) / 100)
                          }
                        />
                      </svg>
                    </span>
                  ) : (
                    <span className="anticon text-destructive" role="img">
                      <CircleAlertIcon fill={'transparent'} height={12} size={12} width={12} />
                    </span>
                  )}
                </div>
              )}
              {sizeLabel && (
                <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                  {sizeLabel}
                </span>
              )}
            </div>
            {canRetry && (
              <div className="flex flex-row" onClick={(event) => event.stopPropagation()}>
                {errorCode ? (
                  <FileUploadErrorActions compact code={errorCode} />
                ) : (
                  <ActionIcon
                    icon={RotateCwIcon}
                    size={{ blockSize: 24, size: 12 }}
                    title={t('retry', { ns: 'common' })}
                    onClick={() => {
                      void retryChatUploadFile(id);
                    }}
                  />
                )}
              </div>
            )}
            <AttachmentRemove label={t('close', { ns: 'common' })} />
          </Attachment>
        }
      />
      <AttachmentHoverCardContent>{detail}</AttachmentHoverCardContent>
    </AttachmentHoverCard>
  );
});

export default ContextItem;
