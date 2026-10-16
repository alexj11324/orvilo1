import { FileTypeIcon } from '@lobehub/ui';
import { cn } from 'cn';
import { ArrowUpIcon } from 'lucide-react';
import { memo, type ReactNode, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Upload } from '@/components/Upload';
import { useCurrentFolderId } from '@/features/ResourceManager/hooks/useCurrentFolderId';
import { useTopLevelFileUpload } from '@/features/ResourceManager/hooks/useTopLevelFileUpload';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { getResourceSourceFilter } from '@/features/ResourceManager/store/selectors';
import { usePermission } from '@/hooks/usePermission';
import { useFileStore } from '@/store/file';
import { ResourceSourceFilter } from '@/types/files';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

const ICON_SIZE = 80;

const styles = {
  actionTitle: 'mbs-3 text-base leading-6 text-muted-foreground',
  card: 'relative overflow-hidden cursor-pointer w-50 h-35 border border-divider rounded-(--radius-card) text-center font-medium bg-card transition-[background-color] duration-(--orvilo-motion-fast) ease-[ease-in-out] motion-reduce:transition-none hover:bg-accent',
  glow: 'absolute -inset-be-3 end-0 size-12 opacity-50 blur-[calc(var(--spacing)*6)]',
  icon: 'absolute z-1 -inset-be-6 end-2 flex-none',
};

const EmptyPlaceholder = () => {
  const { t } = useTranslation('components');

  const pushDockFileList = useFileStore((s) => s.pushDockFileList);
  const uploadTopLevel = useTopLevelFileUpload();

  const libraryId = useResourceManagerStore((s) => s.libraryId);
  const [sourceFilter, setSourceFilter] = useResourceManagerStore((s) => [
    getResourceSourceFilter(s),
    s.setSourceFilter,
  ]);
  const currentFolderId = useCurrentFolderId();

  const { allowed: canCreate } = usePermission('create_content');

  // A narrowed source can empty a category that is not actually empty — the
  // images view opens on generated output, so a library of uploads would
  // otherwise read as "you have nothing yet". Name the filter and offer the
  // way back instead of the onboarding prompt.
  if (sourceFilter !== ResourceSourceFilter.All) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full w-full pbe-25">
        <h4 className="text-xl leading-7 font-semibold">
          {t('FileManager.emptyStatus.filteredTitle')}
        </h4>
        <Button size="normal" onClick={() => setSourceFilter(ResourceSourceFilter.All)}>
          {t('FileManager.emptyStatus.actions.showAllSources')}
        </Button>
      </div>
    );
  }

  if (!canCreate || libraryId) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full pbe-25">
        <h4 className="text-xl leading-7 font-semibold">{t('FileManager.emptyStatus.title')}</h4>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-6 h-full w-full pbe-25">
      <div className="flex flex-col justify-center text-center">
        <h4 className="text-xl leading-7 font-semibold">{t('FileManager.emptyStatus.title')}</h4>
        <div className="text-sm leading-5.5 text-muted-foreground">
          {t('FileManager.emptyStatus.or')}
        </div>
      </div>
      <div className="flex flex-row gap-3">
        <Upload
          multiple={true}

          beforeUpload={async (file) => {
            await uploadTopLevel([file]);
            return false;
          }}
        >
          <div className={cn('flex flex-col p-4', styles.card)}>
            <span className={styles.actionTitle}>{t('FileManager.emptyStatus.actions.file')}</span>
            <div className={styles.glow} style={{ background: 'var(--palette-gold-6)' }} />
            <FileTypeIcon
              className={styles.icon}
              color={'var(--palette-gold-6)'}
              size={ICON_SIZE}
              icon={
                <span className="anticon" role="img">
                  <ArrowUpIcon
                    color={'#fff'}
                    fill={'transparent'}
                    height={'1em'}
                    size={'1em'}
                    width={'1em'}
                  />
                </span>
              }
            />
          </div>
        </Upload>
        <DirectoryUpload
          beforeUpload={async (file) => {
            // Directory upload keeps its own path — the whole tree inherits
            // its root's visibility, so we skip the mode-driven default and
            // let the server infer from the parent chain.
            await pushDockFileList([file], libraryId, currentFolderId ?? undefined);

            return false;
          }}
        >
          <div className={cn('flex flex-col p-4', styles.card)}>
            <span className={styles.actionTitle}>
              {t('FileManager.emptyStatus.actions.folder')}
            </span>
            <div className={styles.glow} style={{ background: 'var(--palette-geekblue-6)' }} />
            <FileTypeIcon
              className={styles.icon}
              color={'var(--palette-geekblue-6)'}
              size={ICON_SIZE}
              type={'folder'}
              icon={
                <span className="anticon" role="img">
                  <ArrowUpIcon
                    color={'#fff'}
                    fill={'transparent'}
                    height={'1em'}
                    size={'1em'}
                    width={'1em'}
                  />
                </span>
              }
            />
          </div>
        </DirectoryUpload>
      </div>
    </div>
  );
};

const DirectoryUpload = memo<{
  beforeUpload: (file: File) => Promise<boolean>;
  children: ReactNode;
}>(({ beforeUpload, children }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <span
      {...clickableProps()}
      className={cn(CLICKABLE_FOCUS_RING, 'inline-block')}
      onClick={() => inputRef.current?.click()}
    >
      <input
        multiple
        aria-hidden="true"
        className="hidden"
        tabIndex={-1}
        type={'file'}
        ref={(el) => {
          inputRef.current = el;
          el?.setAttribute('webkitdirectory', '');
        }}
        onChange={async (event) => {
          const files = event.target.files ? [...event.target.files] : [];
          event.target.value = '';
          for (const file of files) {
            await beforeUpload(file);
          }
        }}
      />
      {children}
    </span>
  );
});
DirectoryUpload.displayName = 'DirectoryUpload';

export default EmptyPlaceholder;
