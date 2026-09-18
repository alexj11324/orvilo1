'use client';

import { Block, Flexbox, Icon } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { type ElectronAppState, useWatchBroadcast } from '@orvilo/electron-client-ipc';
import { cssVar } from 'antd-style';
import { Bell, Check, FolderOpen, Mic, MonitorCog, SquareArrowOutUpRight } from 'lucide-react';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { isDesktop } from '@/const/version';
import { ensureElectronIpc } from '@/utils/electron/ipc';

type PermissionMeta = {
  descriptionKey: string;
  icon: typeof Bell;
  iconColor: string;
  id: number;
  titleKey: string;
};

type PermissionButtonKey =
  'devices.osPermissions.actions.grant' | 'devices.osPermissions.actions.openSettings';

type PermissionItem = PermissionMeta & {
  buttonKey: PermissionButtonKey;
  granted: boolean;
};

const permissionMetas: PermissionMeta[] = [
  {
    descriptionKey: 'devices.osPermissions.items.notifications.description',
    icon: Bell,
    iconColor: '#FFCB47',
    id: 1,
    titleKey: 'devices.osPermissions.items.notifications.title',
  },
  {
    descriptionKey: 'devices.osPermissions.items.fileAccess.description',
    icon: FolderOpen,
    iconColor: '#67AF3F',
    id: 2,
    titleKey: 'devices.osPermissions.items.fileAccess.title',
  },
  {
    descriptionKey: 'devices.osPermissions.items.screenAudio.description',
    icon: Mic,
    iconColor: '#4A77FF',
    id: 3,
    titleKey: 'devices.osPermissions.items.screenAudio.title',
  },
  {
    descriptionKey: 'devices.osPermissions.items.accessibility.description',
    icon: MonitorCog,
    iconColor: '#7A45D3',
    id: 4,
    titleKey: 'devices.osPermissions.items.accessibility.title',
  },
];

/**
 * Whether this install can show the OS-permission surface at all: Electron
 * only, and macOS only — the four managed grants (notifications, full disk
 * access, screen & audio, accessibility) are all macOS capabilities. `null`
 * while the platform probe is still in flight.
 */
export const useIsMacOsDevice = (): boolean | null => {
  const [isMac, setIsMac] = useState<boolean | null>(isDesktop ? null : false);

  useEffect(() => {
    if (!isDesktop) return;
    let mounted = true;
    ensureElectronIpc()
      .system.getAppState()
      .then((state: ElectronAppState) => {
        if (mounted) setIsMac(state.platform === 'darwin');
      })
      .catch(() => {
        if (mounted) setIsMac(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  return isMac;
};

/**
 * macOS permission management for the local device — the surface the retired
 * `/desktop-onboarding` permissions step used to host. Lives under device
 * settings because these grants belong to THIS machine's execution readiness,
 * not to the account's onboarding state.
 */
const OsPermissionsPanel = memo(() => {
  const { t } = useTranslation('setting');
  const [permissions, setPermissions] = useState<PermissionItem[]>(() =>
    permissionMetas.map((p) => ({
      ...p,
      buttonKey: 'devices.osPermissions.actions.grant',
      granted: false,
    })),
  );

  const checkAllPermissions = useCallback(async () => {
    const ipc = ensureElectronIpc();
    const state = await ipc.system.getAppState();
    if (state.platform !== 'darwin') return;

    const notifStatus = await ipc.notification.getNotificationPermissionStatus();
    const micStatus = await ipc.system.getMediaAccessStatus('microphone');
    const screenStatus = await ipc.system.getMediaAccessStatus('screen');
    const accessibilityStatus = await ipc.system.getAccessibilityStatus();
    // Full Disk Access can now be checked by attempting to read protected directories
    const fullDiskStatus = await ipc.system.getFullDiskAccessStatus();

    setPermissions((prev) =>
      prev.map((p) => {
        if (p.id === 1) return { ...p, granted: notifStatus === 'authorized' };
        // Full Disk Access status is detected by reading protected directories
        if (p.id === 2)
          return {
            ...p,
            buttonKey: 'devices.osPermissions.actions.openSettings',
            granted: fullDiskStatus,
          };
        if (p.id === 3)
          return { ...p, granted: micStatus === 'granted' && screenStatus === 'granted' };
        if (p.id === 4) return { ...p, granted: accessibilityStatus };
        return p;
      }),
    );
  }, []);

  useEffect(() => {
    void checkAllPermissions();
  }, [checkAllPermissions]);

  // Listen for window focus event from Electron main process — returning from
  // the macOS settings app is the moment a fresh grant becomes visible.
  useWatchBroadcast('windowFocused', () => {
    void checkAllPermissions();
  });

  const handlePermissionRequest = async (permissionId: number) => {
    const ipc = ensureElectronIpc();
    switch (permissionId) {
      case 1: {
        await ipc.notification.requestNotificationPermission();
        break;
      }
      case 2: {
        // Use native prompt dialog for Full Disk Access
        await ipc.system.promptFullDiskAccessIfNotGranted();
        break;
      }
      case 3: {
        await ipc.system.requestMicrophoneAccess();
        await ipc.system.requestScreenAccess();
        break;
      }
      case 4: {
        await ipc.system.requestAccessibilityAccess();
        break;
      }
      default: {
        break;
      }
    }
    // Re-check permissions after a short delay to allow system dialogs
    setTimeout(() => {
      void checkAllPermissions();
    }, 1000);
  };

  return (
    <Block gap={12} padding={4} style={{ width: '100%' }} variant={'outlined'}>
      {permissions.map((permission) => (
        <Block
          horizontal
          align={'center'}
          clickable={!permission.granted}
          gap={16}
          key={permission.id}
          paddingBlock={8}
          paddingInline={'12px 12px'}
          variant={'borderless'}
          style={{
            background: permission.granted ? cssVar.colorFillSecondary : undefined,
            borderColor: permission.granted ? cssVar.colorSuccess : undefined,
          }}
          onClick={() => !permission.granted && handlePermissionRequest(permission.id)}
        >
          <Block align={'center'} height={40} justify={'center'} variant={'outlined'} width={40}>
            <Icon color={cssVar.colorTextDescription} icon={permission.icon} size={20} />
          </Block>
          <Flexbox gap={2} style={{ flex: 1 }}>
            <Text weight={500}>{t(permission.titleKey as any)}</Text>
            <Text color={cssVar.colorTextSecondary} fontSize={12}>
              {t(permission.descriptionKey as any)}
            </Text>
          </Flexbox>
          {permission.granted ? (
            <Icon color={cssVar.colorSuccess} icon={Check} size={20} />
          ) : (
            <Button
              icon={SquareArrowOutUpRight}
              iconPosition={'end'}
              size={'small'}
              type={'text'}
              style={{
                color: cssVar.colorTextSecondary,
              }}
              onClick={(e) => {
                e.stopPropagation();
                void handlePermissionRequest(permission.id);
              }}
            >
              {t(permission.buttonKey)}
            </Button>
          )}
        </Block>
      ))}
    </Block>
  );
});

OsPermissionsPanel.displayName = 'OsPermissionsPanel';

export default OsPermissionsPanel;
