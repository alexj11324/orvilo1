'use client';

import { cssVar } from 'antd-style';
import { ArrowUpIcon, FolderIcon, HouseIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import NavItem from '@/features/NavPanel/components/NavItem';
import { useFetchDeviceDirectory } from '@/store/device/directoryHooks';

interface RemoteDirectoryBrowserProps {
  defaultPath?: string;
  deviceId: string;
  error?: string;
  loading: boolean;
  onCancel: () => void;
  onManual: (path: string) => void;
  onSelect: (path: string) => void;
}

export const RemoteDirectoryBrowser = ({
  defaultPath,
  deviceId,
  error: submitError,
  loading,
  onCancel,
  onManual,
  onSelect,
}: RemoteDirectoryBrowserProps) => {
  const { t } = useTranslation('device');
  const { t: tCommon } = useTranslation('common');
  const [path, setPath] = useState(defaultPath);
  const [draft, setDraft] = useState<string>();
  const { directory, entries, error, hasMore, isLoading, isLoadingMore, loadMore, retry } =
    useFetchDeviceDirectory(deviceId, path);
  const displayedPath = draft ?? directory?.path ?? path ?? '';

  const navigate = (nextPath?: string) => {
    setDraft(undefined);
    if (nextPath === path) void retry();
    else setPath(nextPath);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="text-muted-foreground">{t('workingDirectory.browseDescription')}</div>
      <div className="flex items-center gap-2">
        <ActionIcon
          aria-label={t('workingDirectory.home')}
          disabled={loading}
          icon={HouseIcon}
          title={t('workingDirectory.home')}
          onClick={() => navigate()}
        />
        <ActionIcon
          aria-label={t('workingDirectory.parentFolder')}
          disabled={loading || !directory?.parentPath}
          icon={ArrowUpIcon}
          title={t('workingDirectory.parentFolder')}
          onClick={() => directory?.parentPath && navigate(directory.parentPath)}
        />
        <Input
          aria-label={t('workingDirectory.current')}
          disabled={loading}
          placeholder={t('workingDirectory.placeholder')}
          style={{ flex: 1, minWidth: 0 }}
          value={displayedPath}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && navigate(displayedPath.trim() || undefined)}
        />
        <Button disabled={loading} onClick={() => navigate(displayedPath.trim() || undefined)}>
          {t('workingDirectory.openPath')}
        </Button>
      </div>
      {directory && directory.roots.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {directory.roots.map((root) => (
            <Button disabled={loading} key={root} size="sm" onClick={() => navigate(root)}>
              {root}
            </Button>
          ))}
        </div>
      )}
      <div
        aria-busy={isLoading}
        className="flex flex-col gap-1"
        key={directory?.path ?? path ?? 'home'}
        style={{ height: 'min(320px, 40vh)', overflow: 'auto' }}
      >
        {isLoading ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2">
            <NeuralNetworkLoading />
            <div className="text-muted-foreground">{t('workingDirectory.foldersLoading')}</div>
          </div>
        ) : (
          <>
            {entries.map((entry) => (
              <NavItem
                aria-disabled={loading || !entry.readable}
                disabled={loading || !entry.readable}
                flex={'none'}
                icon={FolderIcon}
                key={entry.path + entry.name}
                role={'button'}
                tabIndex={loading || !entry.readable ? -1 : 0}
                title={entry.name}
                titleColor={cssVar.colorText}
                description={
                  entry.readable ? undefined : (
                    <div className="text-muted-foreground">
                      {t('workingDirectory.folderUnreadable')}
                    </div>
                  )
                }
                onClick={() => navigate(entry.path)}
                onKeyDown={(event) => {
                  if (!loading && entry.readable && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault();
                    navigate(entry.path);
                  }
                }}
              />
            ))}
            {error ? (
              <div className="flex flex-col items-center gap-2 p-4" role={'alert'}>
                <div
                  className="text-muted-foreground"
                  style={{ textAlign: 'center', whiteSpace: 'normal' }}
                >
                  {t('workingDirectory.foldersLoadFailed')}
                </div>
                <Button disabled={loading} onClick={() => void retry()}>
                  {tCommon('retry')}
                </Button>
              </div>
            ) : directory && entries.length === 0 ? (
              <div className="flex flex-1 flex-col items-center justify-center">
                <div className="text-muted-foreground">{t('workingDirectory.foldersEmpty')}</div>
              </div>
            ) : null}
            {hasMore && !error && (
              <Button disabled={loading} loading={isLoadingMore} onClick={() => void loadMore()}>
                {t('workingDirectory.loadMoreFolders')}
              </Button>
            )}
          </>
        )}
      </div>
      {submitError && (
        <div className="text-destructive" role={'alert'}>
          {submitError}
        </div>
      )}
      <div className="flex flex-wrap justify-between gap-2">
        <Button disabled={loading} onClick={() => onManual(displayedPath)}>
          {t('workingDirectory.enterPathManually')}
        </Button>
        <div className="flex gap-2">
          <Button disabled={loading} onClick={onCancel}>
            {tCommon('cancel')}
          </Button>
          <Button
            loading={loading}
            disabled={
              !directory || isLoading || (draft !== undefined && draft.trim() !== directory.path)
            }
            onClick={() => directory && onSelect(directory.path)}
          >
            {t('workingDirectory.useFolder')}
          </Button>
        </div>
      </div>
    </div>
  );
};
