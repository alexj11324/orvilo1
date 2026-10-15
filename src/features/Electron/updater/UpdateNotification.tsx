import { Markdown } from '@lobehub/ui';
import type { UpdateInfo } from '@orvilo/electron-client-ipc';
import { useWatchBroadcast } from '@orvilo/electron-client-ipc';
import { t } from 'i18next';
import { X } from 'lucide-react';
import React, { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button as BaseButton } from '@/components/ui/button';
import { getHostPort } from '@/platform';
import { rendererOtaService } from '@/services/electron/rendererOta';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';

import { selectUpdateInfo } from './selectUpdateInfo';

const styles = {
  installLaterCloseButton: 'text-foreground-tertiary hover:text-foreground',
  installLaterToast:
    'fixed z-1000 inset-be-5 start-4 flex gap-2 items-center [max-inline-size:calc(100vw-32px)] py-2 ps-3 pe-2 rounded-(--radius-overlay) text-sm leading-5.5 text-foreground bg-popover shadow-(--shadow-popover)',
  releaseNote: 'overflow-scroll max-h-75 p-2 rounded-(--radius-card) bg-fill-quaternary',
};

interface UpdateDetailContentProps {
  updateInfo: UpdateInfo;
}

const UpdateDetailContent = memo<UpdateDetailContentProps>(({ updateInfo }) => {
  const { t: tElectron } = useTranslation('electron');
  const { close } = useModalContext();
  const [isInstalling, setIsInstalling] = useState(false);

  return (
    <div className="flex flex-col gap-3 max-w-120">
      <div className="text-xs leading-5 text-muted-foreground">{updateInfo.version}</div>
      {updateInfo.releaseNotes &&
        (typeof updateInfo.releaseNotes === 'string' ? (
          <div className={styles.releaseNote}>
            <Markdown>{updateInfo.releaseNotes}</Markdown>
          </div>
        ) : (
          <div className={styles.releaseNote}>
            {updateInfo.releaseNotes.map((note) => (
              <Markdown key={note.version}>{note.note ?? ''}</Markdown>
            ))}
          </div>
        ))}
      <div className="flex gap-2 justify-end">
        <BaseButton
          className="leading-5.5"
          size="lg"
          onClick={() => {
            void getHostPort().updater.installUpdateLater();
            close();
          }}
        >
          {tElectron('updater.installLater')}
        </BaseButton>
        <BaseButton
          className="leading-5.5"
          loading={isInstalling}
          size="lg"
          variant={'default'}
          onClick={() => {
            setIsInstalling(true);
            void getHostPort().updater.installUpdateNow();
          }}
        >
          {tElectron('updater.restartAndInstall')}
        </BaseButton>
      </div>
    </div>
  );
});

UpdateDetailContent.displayName = 'UpdateDetailContent';

const openUpdateDetailModal = (updateInfo: UpdateInfo) =>
  createModal({
    content: <UpdateDetailContent updateInfo={updateInfo} />,
    footer: null,
    maskClosable: true,
    title: t('updater.updateReady', { ns: 'electron' }),
    width: 520,
  });

export const UpdateNotification: React.FC = () => {
  const { t: tElectron } = useTranslation('electron');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [installConfirmMode, setInstallConfirmMode] = useState<
    'unconfirm' | 'installLater' | 'installNow' | null
  >('unconfirm');
  const [isInstalling, setIsInstalling] = useState(false);
  const isDevMode = useUserStore((s) => userGeneralSettingsSelectors.config(s).isDevMode);

  useWatchBroadcast('updateReady', (info) => {
    setUpdateInfo((current) => selectUpdateInfo(current, info));
    if (info.kind === 'app') setInstallConfirmMode('unconfirm');
  });

  useWatchBroadcast('updateWillInstallLater', () => {
    setInstallConfirmMode('installLater');

    setTimeout(() => setInstallConfirmMode(null), 5000);
  });

  if (updateInfo?.kind === 'renderer') {
    return (
      <div className={styles.installLaterToast}>
        <span>{tElectron('updater.rendererReady', { version: updateInfo.version })}</span>
        <BaseButton
          className="leading-5.5"
          size="lg"
          variant={'ghost'}
          onClick={() => setUpdateInfo(null)}
        >
          {tElectron('updater.ignore')}
        </BaseButton>
        <BaseButton
          className="leading-5.5"
          loading={isInstalling}
          size="lg"
          variant={'default'}
          onClick={async () => {
            setIsInstalling(true);
            try {
              if (!(await rendererOtaService.applyNow())) {
                toast.error(tElectron('updater.rendererUpdateError'));
              }
            } catch (error) {
              console.error('Failed to apply renderer update:', error);
              toast.error(tElectron('updater.rendererUpdateError'));
            } finally {
              setIsInstalling(false);
            }
          }}
        >
          {tElectron('updater.upgradeNow')}
        </BaseButton>
      </div>
    );
  }

  if (!updateInfo) return null;

  if (installConfirmMode === 'installLater') {
    return (
      <div className={styles.installLaterToast}>
        {tElectron('updater.willInstallLater')}
        <BaseButton
          aria-label="Close"
          className={styles.installLaterCloseButton}
          size="icon"
          type="button"
          variant="ghost"
          onClick={() => setInstallConfirmMode(null)}
        >
          <X className="size-4" size={16} />
        </BaseButton>
      </div>
    );
  }

  if (installConfirmMode === 'unconfirm')
    return (
      <div className={styles.installLaterToast}>
        <span
          className="cursor-pointer"
          onClick={() => {
            if (updateInfo) openUpdateDetailModal(updateInfo);
          }}
        >
          {tElectron('updater.updateReady')}
          {isDevMode && updateInfo?.version ? ` · ${updateInfo.version}` : ''}
        </span>
        <BaseButton
          className="leading-5.5"
          size="lg"
          variant={'ghost'}
          onClick={() => {
            void getHostPort().updater.installUpdateLater();
          }}
        >
          {tElectron('updater.later')}
        </BaseButton>
        <BaseButton
          className="leading-5.5"
          loading={isInstalling}
          size="lg"
          variant={'default'}
          onClick={() => {
            setIsInstalling(true);
            void getHostPort().updater.installUpdateNow();
          }}
        >
          {tElectron('updater.upgradeNow')}
        </BaseButton>
      </div>
    );

  return null;
};
