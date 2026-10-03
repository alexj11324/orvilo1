import { Markdown } from '@lobehub/ui';
import type { UpdateInfo } from '@orvilo/electron-client-ipc';
import { useWatchBroadcast } from '@orvilo/electron-client-ipc';
import { createStaticStyles, cssVar } from 'antd-style';
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

const styles = createStaticStyles(({ css, cssVar }) => ({
  installLaterCloseButton: css`
    all: unset;

    cursor: pointer;

    display: inline-flex;
    align-items: center;
    justify-content: center;

    inline-size: 24px;
    block-size: 24px;
    border-radius: 6px;

    color: ${cssVar.colorTextTertiary};

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }
  `,

  installLaterToast: css`
    position: fixed;
    z-index: 1000;
    inset-block-end: 20px;
    inset-inline-start: 16px;

    display: flex;
    gap: 8px;
    align-items: center;

    max-inline-size: calc(100vw - 32px);
    padding-block: 8px;
    padding-inline: 12px 8px;
    border-radius: ${cssVar.borderRadiusLG};

    font-size: ${cssVar.fontSizeSM};
    line-height: 1.25;
    color: ${cssVar.colorText};

    background: ${cssVar.colorBgElevated};
    box-shadow: ${cssVar.boxShadow};
  `,

  releaseNote: css`
    overflow: scroll;

    max-height: 300px;
    padding: 8px;
    border-radius: 8px;

    background: ${cssVar.colorFillQuaternary};
  `,
}));

interface UpdateDetailContentProps {
  updateInfo: UpdateInfo;
}

const UpdateDetailContent = memo<UpdateDetailContentProps>(({ updateInfo }) => {
  const { t: tElectron } = useTranslation('electron');
  const { close } = useModalContext();
  const [isInstalling, setIsInstalling] = useState(false);

  return (
    <div className="flex flex-col gap-3" style={{ maxWidth: 480 }}>
      <div style={{ color: cssVar.colorTextSecondary, fontSize: 12 }}>{updateInfo.version}</div>
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
          onClick={() => {
            void getHostPort().updater.installUpdateLater();
            close();
          }}
        >
          {tElectron('updater.installLater')}
        </BaseButton>
        <BaseButton
          loading={isInstalling}
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
        <BaseButton size={'sm'} variant={'ghost'} onClick={() => setUpdateInfo(null)}>
          {tElectron('updater.ignore')}
        </BaseButton>
        <BaseButton
          loading={isInstalling}
          size={'sm'}
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
        <button
          aria-label="Close"
          className={styles.installLaterCloseButton}
          type="button"
          onClick={() => setInstallConfirmMode(null)}
        >
          <X style={{ fontSize: 14 }} />
        </button>
      </div>
    );
  }

  if (installConfirmMode === 'unconfirm')
    return (
      <div className={styles.installLaterToast}>
        <span
          style={{ cursor: 'pointer' }}
          onClick={() => {
            if (updateInfo) openUpdateDetailModal(updateInfo);
          }}
        >
          {tElectron('updater.updateReady')}
          {isDevMode && updateInfo?.version ? ` · ${updateInfo.version}` : ''}
        </span>
        <BaseButton
          size={'sm'}
          variant={'ghost'}
          onClick={() => {
            void getHostPort().updater.installUpdateLater();
          }}
        >
          {tElectron('updater.later')}
        </BaseButton>
        <BaseButton
          loading={isInstalling}
          size={'sm'}
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
