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
    'cursor-pointer relative overflow-hidden w-[250px] h-16 py-1 ps-2 pe-6 border border-border rounded-[8px] bg-accent',
  deleteButton:
    'text-white hover:text-white active:text-white bg-(--ant-color-bg-mask) hover:bg-destructive',
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
        <div className="flex flex-col" style={{ overflow: 'hidden' }}>
          <div className="truncate">{file.name}</div>
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
              size={'small'}
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
            size={'small'}
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
