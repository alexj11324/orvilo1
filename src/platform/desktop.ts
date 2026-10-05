import type { HostCapability, HostContext, HostKind } from '@orvilo/types';
import { deviceOperationError, deviceOperationOk } from '@orvilo/types';

import { autoUpdateService } from '@/services/electron/autoUpdate';
import { desktopNotificationService } from '@/services/electron/desktopNotification';
import { gatewayConnectionService } from '@/services/electron/gatewayConnection';
import { electronOpenInAppService } from '@/services/electron/openInApp';
import { desktopSettingsService } from '@/services/electron/settings';
import { electronSystemService } from '@/services/electron/system';
import { desktopTrayService } from '@/services/electron/tray';

import { pickFilesViaDomInput } from './domFilePick';
import type { HostLocalResourceRef, HostPort } from './host';

/**
 * Desktop (Electron) host adapter — the ONLY file in the platform layer that
 * may import Electron services. Never re-export it from the shared barrel;
 * only the desktop entry imports it, so the web graph stays Electron-free.
 *
 * Adapter = delegation: it routes each host capability to the existing
 * service implementation instead of reimplementing it, and enforces the one
 * rule that didn't exist before — device-resource identity — on every
 * path-bound host action.
 */
const DESKTOP_CAPABILITIES: ReadonlySet<HostCapability> = new Set([
  'app.update',
  'dialog.openFile',
  'file.pickAttachment',
  'link.openExternal',
  'menu.native',
  'notification.native',
  'shell.openTerminal',
  'shell.revealPath',
  'tray.manage',
  'window.manage',
]);

export const createDesktopHostPort = (
  kind: Extract<HostKind, 'desktop' | 'popup'> = 'desktop',
): HostPort => {
  // Resolved lazily from the gateway handshake; only a Desktop whose own
  // machine is a registered device may answer a deviceId here.
  let localDeviceIdPromise: Promise<string | undefined> | undefined;

  const ensureLocalDeviceId = (): Promise<string | undefined> => {
    localDeviceIdPromise ??= gatewayConnectionService
      .getDeviceInfo()
      .then((info) => info?.deviceId ?? undefined)
      .catch(() => undefined);
    return localDeviceIdPromise;
  };

  const context: HostContext = {
    capabilities: DESKTOP_CAPABILITIES,
    kind,
  };

  /**
   * The one structural rule this adapter adds: a path-bound host action
   * (reveal in Finder, open in IDE/Terminal) may only ever target the
   * device this shell's machine actually is. A remote device's path is
   * `RESOURCE_OUT_OF_SCOPE`, never "open it locally anyway".
   */
  const proveLocalResource = async (
    resource: HostLocalResourceRef,
  ): Promise<true | ReturnType<typeof deviceOperationError>> => {
    const localId = await ensureLocalDeviceId();
    if (!localId || resource.deviceId !== localId) {
      return deviceOperationError(
        'RESOURCE_OUT_OF_SCOPE',
        resource.deviceId,
        'Path does not belong to this host machine.',
      );
    }
    context.localDeviceId = localId;
    return true;
  };

  return {
    context,
    dialog: {
      pickAttachments: (options) => pickFilesViaDomInput(options),
      selectFolder: (params) => electronSystemService.selectFolder(params),
    },
    ensureLocalDeviceId,
    has: (capability) => DESKTOP_CAPABILITIES.has(capability),
    menu: {
      closePopupContextMenu: () => electronSystemService.closePopupContextMenu(),
      popupContextMenu: (params) => electronSystemService.popupContextMenu(params),
      showContextMenu: (type, data) => electronSystemService.showContextMenu(type, data),
    },
    notification: {
      setBadgeCount: (count) => desktopNotificationService.setBadgeCount(count),
      show: (params) => desktopNotificationService.showNotification(params),
    },
    openExternal: (url) => electronSystemService.openExternalLink(url),
    shell: {
      detectApps: () => electronOpenInAppService.detectApps(),
      openInApp: async ({ appId, resource }) => {
        const proven = await proveLocalResource(resource);
        if (proven !== true) return { error: proven, status: 'error' };
        return deviceOperationOk(
          await electronOpenInAppService.openInApp({ appId, path: resource.path }),
        );
      },
    },
    tray: {
      setVisible: (visible) => desktopSettingsService.setAppTrayVisible(visible),
      updateNavigationSnapshot: (snapshot) => desktopTrayService.updateNavigationSnapshot(snapshot),
    },
    updater: {
      checkUpdate: () => autoUpdateService.checkUpdate(),
      getBuildChannel: () => autoUpdateService.getBuildChannel(),
      getUpdateChannel: () => autoUpdateService.getUpdateChannel(),
      getUpdaterState: () => autoUpdateService.getUpdaterState(),
      installUpdateLater: () => autoUpdateService.installLater(),
      installUpdateNow: () => autoUpdateService.installNow(),
      setUpdateChannel: (channel) => autoUpdateService.setUpdateChannel(channel),
    },
    window: {
      close: () => electronSystemService.closeWindow(),
      isAlwaysOnTop: () => electronSystemService.isWindowAlwaysOnTop(),
      isFullScreen: () => electronSystemService.isWindowFullScreen(),
      isMaximized: () => electronSystemService.isWindowMaximized(),
      maximize: () => electronSystemService.maximizeWindow(),
      minimize: () => electronSystemService.minimizeWindow(),
      setAlwaysOnTop: (flag) => electronSystemService.setWindowAlwaysOnTop(flag),
      setMinimumSize: (params) => electronSystemService.setWindowMinimumSize(params),
      setSize: (params) => electronSystemService.setWindowSize(params),
    },
  };
};
