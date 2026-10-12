import { cn } from 'cn';
import { RotateCw, Trash } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { FileUploadErrorActions } from '@/business/client/features/FileUploadErrorActions';
import ActionIcon from '@/components/ActionIcon';
import FileIcon from '@/components/FileIcon';
import UploadDetail from '@/features/ChatInput/components/UploadDetail';
import { type UploadFileItem } from '@/types/files';

const styles = {
  actions: 'flex-none self-start',
  container:
    'cursor-pointer relative overflow-hidden w-62.5 h-16 py-1 px-2 border border-border rounded-(--radius-card) bg-accent',
  deleteButton:
    'text-foreground hover:bg-destructive-wash hover:text-destructive-text active:text-destructive-text',
};

interface FileItemProps extends UploadFileItem {
  onRemove?: () => void;
  onRetry?: () => void;
}

const FileItem = memo<FileItemProps>(
  ({ error, errorCode, id, onRemove, onRetry, file, status, uploadState, tasks }) => {
    const { t: tCommon } = useTranslation('common');
    return (
      <div className={cn('flex flex-row items-center gap-3', styles.container)} key={id}>
        <FileIcon fileName={file.name} fileType={file.type} />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="truncate text-sm leading-5.5">{file.name}</div>
          <UploadDetail
            error={error}
            size={file.size}
            status={status}
            tasks={tasks}
            uploadState={uploadState}
          />
        </div>
        <div className={cn('flex flex-row', styles.actions)}>
          {status === 'error' && errorCode ? (
            <FileUploadErrorActions compact code={errorCode} />
          ) : status === 'error' ? (
            <ActionIcon
              aria-label={tCommon('refresh')}
              className={styles.deleteButton}
              icon={RotateCw}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              onClick={(e) => {
                e.stopPropagation();
                onRetry?.();
              }}
            />
          ) : null}
          <ActionIcon
            aria-label={tCommon('delete')}
            className={styles.deleteButton}
            icon={Trash}
            size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.();
            }}
          />
        </div>
      </div>
    );
  },
);
export default FileItem;
