import { createStaticStyles, cssVar, cx } from 'antd-style';
import { CircleAlertIcon, CircleCheckIcon, RotateCwIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { FileUploadErrorActions } from '@/business/client/features/FileUploadErrorActions';
import ActionIcon from '@/components/ActionIcon';
import ClosableBadge from '@/components/ClosableBadge';
import { Spinner } from '@/components/ui/spinner';
import { useEventCallback } from '@/hooks/useEventCallback';
import { useFileStore } from '@/store/file';
import { type UploadFileItem } from '@/types/files/upload';

import UploadDetail from '../../../components/UploadDetail';
import { SimpleTooltip } from '../../../SimpleTooltip';
import Content from './Content';
import { openFilePreviewModal } from './FilePreviewModal.loader';
import { useUploadCompletion } from './useUploadCompletion';
import { getFileBasename, getUploadChipSize, getUploadChipState } from './utils';

const styles = createStaticStyles(({ css }) => ({
  chip: css`
    max-width: 100%;
    height: 28px;
  `,
  content: css`
    display: flex;
    gap: 4px;
    align-items: center;

    min-width: 0;
    max-width: 380px;
  `,
  size: css`
    flex-shrink: 0;

    font-variant-numeric: tabular-nums;
    line-height: 18px;
    color: ${cssVar.colorTextTertiary};
    white-space: nowrap;
  `,
  thumbnail: css`
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    line-height: 0;
  `,
  statusIcon: css`
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;

    width: 12px;
    height: 12px;

    line-height: 0;
  `,
  name: css`
    overflow: hidden;
    flex: 1;

    min-width: 0;

    line-height: 18px;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

type FileItemProps = UploadFileItem;

const ContextItem = memo<FileItemProps>((props) => {
  const { error, errorCode, file, id, status, tasks, uploadState } = props;
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
        <div className="flex flex-row items-start gap-1" style={{ color: cssVar.colorError }}>
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
    <ClosableBadge
      aria-busy={busy}
      className={styles.chip}
      closeLabel={t('close', { ns: 'common' })}
      size={'lg'}
      variant="secondary"
      onClick={canPreview ? handleClick : undefined}
      onClose={handleClose}
    >
      <SimpleTooltip title={detail}>
        <div className={cx('flex flex-row items-center', styles.content)}>
          <div className={cx('flex flex-col', styles.thumbnail)}>
            <Content {...props} />
          </div>
          <span className={styles.name}>{basename}</span>
          {(indicator !== 'file' || showCompletion) && (
            <div className={cx('flex flex-col', styles.statusIcon)}>
              {showCompletion ? (
                <span
                  aria-label={t('upload.preview.status.success')}
                  className="anticon"
                  role="img"
                  style={{ color: cssVar.colorSuccess }}
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
                  className={styles.statusIcon}
                  role={'progressbar'}
                >
                  <svg aria-hidden="true" height={12} viewBox={'0 0 12 12'} width={12}>
                    <circle
                      cx={6}
                      cy={6}
                      fill={'none'}
                      r={5}
                      stroke={cssVar.colorFillSecondary}
                      strokeWidth={2}
                    />
                    <circle
                      cx={6}
                      cy={6}
                      fill={'none'}
                      r={5}
                      stroke={cssVar.colorPrimary}
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
                <span className="anticon" role="img" style={{ color: cssVar.colorError }}>
                  <CircleAlertIcon fill={'transparent'} height={12} size={12} width={12} />
                </span>
              )}
            </div>
          )}
          {sizeLabel && <span className={styles.size}>{sizeLabel}</span>}
        </div>
      </SimpleTooltip>
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
    </ClosableBadge>
  );
});

export default ContextItem;
