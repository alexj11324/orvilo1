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
  actions: 'absolute top-0 end-0',
  container:
    'cursor-pointer relative overflow-hidden w-62.5 h-16 py-1 ps-2 pe-6 border border-border rounded-(--radius-card) bg-accent',
  deleteButton:
    'text-invert-foreground bg-invert/70 hover:bg-destructive hover:text-destructive-on-fill active:text-destructive-on-fill',
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
        <div className="flex min-w-0 flex-col overflow-hidden">
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
              size={{ blockSize: 28, borderRadius: 6, size: 14 }}
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
            size={{ blockSize: 28, borderRadius: 6, size: 14 }}
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
