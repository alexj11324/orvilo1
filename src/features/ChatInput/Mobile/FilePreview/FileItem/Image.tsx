import { Image } from '@lobehub/ui';
import { cn } from 'cn';
import { RotateCw, Trash } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { FileUploadErrorActions } from '@/business/client/features/FileUploadErrorActions';
import ActionIcon from '@/components/ActionIcon';

import { MIN_IMAGE_SIZE } from './style';

const styles = {
  deleteButton:
    'text-overlay-mask-foreground bg-overlay-mask hover:bg-destructive hover:text-destructive-on-fill active:text-destructive-on-fill',
  editableImage: 'bg-card ring-1 ring-inset ring-(color:--fill)',
  image: 'w-16 min-w-16 min-h-16 max-h-16 my-0',
};

interface FileItemProps {
  alt?: string;
  error?: boolean;
  errorCode?: string;
  loading?: boolean;
  onRemove?: () => void;
  onRetry?: () => void;
  src?: string;
}

const FileItem = memo<FileItemProps>(
  ({ alt, error, errorCode, onRemove, onRetry, src, loading }) => {
    const { t: tCommon } = useTranslation('common');
    const IMAGE_SIZE = MIN_IMAGE_SIZE;

    return (
      <Image
        alwaysShowActions
        alt={alt || ''}
        className="min-w-max"
        classNames={{ wrapper: cn(styles.image, styles.editableImage) }}
        height={64}
        isLoading={loading}
        objectFit={'cover'}
        size={IMAGE_SIZE}
        src={src}
        width={64}
        actions={
          <div className="flex flex-row">
            {error && errorCode ? (
              <FileUploadErrorActions compact code={errorCode} />
            ) : error ? (
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
        }
      />
    );
  },
);

export default FileItem;
