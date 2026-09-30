import { FileTypeIcon } from '@lobehub/ui';
import { Button, Text, Upload } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { ArrowUpIcon, PlusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useCreateNewModal } from '@/features/LibraryModal';
import { useCurrentFolderId } from '@/features/ResourceManager/hooks/useCurrentFolderId';
import { useTopLevelFileUpload } from '@/features/ResourceManager/hooks/useTopLevelFileUpload';
import { useResourceManagerStore } from '@/features/ResourceManager/store';
import { getResourceSourceFilter } from '@/features/ResourceManager/store/selectors';
import { usePermission } from '@/hooks/usePermission';
import { useFileStore } from '@/store/file';
import { ResourceSourceFilter } from '@/types/files';

const ICON_SIZE = 80;

const styles = createStaticStyles(({ css, cssVar }) => ({
  actionTitle: css`
    margin-block-start: 12px;
    font-size: 16px;
    color: ${cssVar.colorTextSecondary};
  `,
  card: css`
    cursor: pointer;

    position: relative;

    overflow: hidden;

    width: 200px;
    height: 140px;
    border-radius: ${cssVar.borderRadiusLG};

    font-weight: 500;
    text-align: center;

    background: ${cssVar.colorFillTertiary};
    box-shadow: 0 0 0 1px ${cssVar.colorFillTertiary} inset;

    transition: background 0.3s ease-in-out;

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  glow: css`
    position: absolute;
    inset-block-end: -12px;
    inset-inline-end: 0;

    width: 48px;
    height: 48px;

    opacity: 0.5;
    filter: blur(24px);
  `,
  icon: css`
    position: absolute;
    z-index: 1;
    inset-block-end: -24px;
    inset-inline-end: 8px;

    flex: none;
  `,
}));

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

  const { open } = useCreateNewModal();
  const { allowed: canCreate } = usePermission('create_content');

  // A narrowed source can empty a category that is not actually empty — the
  // images view opens on generated output, so a library of uploads would
  // otherwise read as "you have nothing yet". Name the filter and offer the
  // way back instead of the onboarding prompt.
  if (sourceFilter !== ResourceSourceFilter.All) {
    return (
      <div
        className="flex flex-col items-center justify-center gap-3 h-[100%] w-[100%]"
        style={{ paddingBottom: 100 }}
      >
        <Text as={'h4'}>{t('FileManager.emptyStatus.filteredTitle')}</Text>
        <Button size={'small'} onClick={() => setSourceFilter(ResourceSourceFilter.All)}>
          {t('FileManager.emptyStatus.actions.showAllSources')}
        </Button>
      </div>
    );
  }

  if (!canCreate) {
    return (
      <div
        className="flex flex-col items-center justify-center h-[100%] w-[100%]"
        style={{ paddingBottom: 100 }}
      >
        <Text as={'h4'}>{t('FileManager.emptyStatus.title')}</Text>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center gap-6 h-[100%] w-[100%]"
      style={{ paddingBottom: 100 }}
    >
      <div className="flex flex-col justify-center" style={{ textAlign: 'center' }}>
        <Text as={'h4'}>{t('FileManager.emptyStatus.title')}</Text>
        <Text type={'secondary'}>{t('FileManager.emptyStatus.or')}</Text>
      </div>
      <div className="flex flex-row gap-3">
        {!libraryId && (
          <div
            className={cx('flex flex-col p-4', styles.card)}
            onClick={() => {
              open();
            }}
          >
            <span className={styles.actionTitle}>
              {t('FileManager.emptyStatus.actions.knowledgeBase')}
            </span>
            <div className={styles.glow} style={{ background: cssVar.purple }} />
            <FileTypeIcon
              className={styles.icon}
              color={cssVar.purple}
              size={ICON_SIZE}
              type={'folder'}
              icon={
                <span className="anticon" role="img">
                  <PlusIcon
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
        )}
        <Upload
          multiple={true}

          beforeUpload={async (file) => {
            await uploadTopLevel([file]);
            return false;
          }}
        >
          <div className={cx('flex flex-col p-4', styles.card)}>
            <span className={styles.actionTitle}>{t('FileManager.emptyStatus.actions.file')}</span>
            <div className={styles.glow} style={{ background: cssVar.gold }} />
            <FileTypeIcon
              className={styles.icon}
              color={cssVar.gold}
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
        <Upload
          directory
          multiple={true}

          beforeUpload={async (file) => {
            // Directory upload keeps its own path — the whole tree inherits
            // its root's visibility, so we skip the mode-driven default and
            // let the server infer from the parent chain.
            await pushDockFileList([file], libraryId, currentFolderId ?? undefined);

            return false;
          }}
        >
          <div className={cx('flex flex-col p-4', styles.card)}>
            <span className={styles.actionTitle}>
              {t('FileManager.emptyStatus.actions.folder')}
            </span>
            <div className={styles.glow} style={{ background: cssVar.geekblue }} />
            <FileTypeIcon
              className={styles.icon}
              color={cssVar.geekblue}
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
        </Upload>
      </div>
    </div>
  );
};

export default EmptyPlaceholder;
