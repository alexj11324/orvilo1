import type {
  DesktopNotificationResult,
  DetectAppsResult,
  OpenInAppId,
  OpenInAppResult,
  PopupContextMenuParams,
  PopupContextMenuResult,
  ShowDesktopNotificationParams,
  TrayNavigationSnapshot,
  UpdateChannel,
  UpdaterState,
  WindowMinimumSizeParams,
  WindowSizeParams,
} from '@orvilo/electron-client-ipc';
import type {
  DeviceOperationResult,
  HostCapability,
  HostContext,
  HostUnsupportedResult,
} from '@orvilo/types';
import { deviceOperationError, hostUnsupported, isHostUnsupportedResult } from '@orvilo/types';

/**
 * HostPort — the single surface through which product code reaches
 * shell-scoped (host) capabilities: windows, OTA updates, native menus,
 * native pickers, tray, external-link handling, notifications.
 *
 * Contract: packages/types/src/host.ts + docs/development/web-desktop-architecture.md.
 *
 * Boundaries this file itself must keep:
 * - Type-only imports from '@orvilo/electron-client-ipc' are erased at compile
 *   time — this module stays free of Electron and any runtime IPC. Never add a
 *   value import from an electron package here; implementations live in
 *   src/platform/desktop.ts (which only the desktop entry may import).
 * - Every method returns a structured result (`HostResult` / a discriminated
 *   `DeviceOperationResult`) instead of silently no-opping or throwing when
 *   the capability is absent — check `isHostUnsupportedResult` /
 *   `isDeviceOperationError`.
 */
export type HostResult<T> = HostUnsupportedResult | T;

/**
 * Unwrap a HostResult with a local fallback for shells where the capability
 * is unsupported. Only for reads whose absence has a sane default (window
 * state flags); actions should branch on `isHostUnsupportedResult` instead.
 */
export const hostResultOr = <T>(result: HostResult<T>, fallback: T): T =>
  isHostUnsupportedResult(result) ? fallback : result;

/**
 * A resource claimed to live on the local machine. `deviceId` is REQUIRED so
 * callers must name the device the path belongs to — the adapter proves it
 * equals this shell's resolved local device identity before letting a path
 * reach the local file manager, terminal or IDE. A remote device's path can
 * never become a local open/reveal target through this port.
 */
export interface HostLocalResourceRef {
  /** Identity of the device the path lives on. */
  deviceId: string;
  /** Absolute path on the device (working-dir binding / authorized root). */
  path: string;
}

export interface HostWindowPort {
  close: () => Promise<HostResult<void>>;
  isAlwaysOnTop: () => Promise<HostResult<boolean>>;
  isFullScreen: () => Promise<HostResult<boolean>>;
  isMaximized: () => Promise<HostResult<boolean>>;
  maximize: () => Promise<HostResult<void>>;
  minimize: () => Promise<HostResult<void>>;
  setAlwaysOnTop: (flag: boolean) => Promise<HostResult<void>>;
  setMinimumSize: (params: WindowMinimumSizeParams) => Promise<HostResult<void>>;
  setSize: (params: WindowSizeParams) => Promise<HostResult<void>>;
}

export interface HostUpdaterPort {
  checkUpdate: () => Promise<HostResult<void>>;
  getBuildChannel: () => Promise<HostResult<string>>;
  getUpdateChannel: () => Promise<HostResult<UpdateChannel>>;
  getUpdaterState: () => Promise<HostResult<UpdaterState>>;
  installUpdateLater: () => Promise<HostResult<void>>;
  installUpdateNow: () => Promise<HostResult<void>>;
  setUpdateChannel: (channel: UpdateChannel) => Promise<HostResult<void>>;
}

export interface HostMenuPort {
  closePopupContextMenu: () => Promise<HostResult<void>>;
  popupContextMenu: (params: PopupContextMenuParams) => Promise<HostResult<PopupContextMenuResult>>;
  showContextMenu: (type: string, data?: unknown) => Promise<HostResult<unknown>>;
}

export interface HostAttachmentPickOptions {
  accept?: string;
  multiple?: boolean;
}

export interface HostFolderPick {
  path: string;
  repoType?: 'git' | 'github';
}

export interface HostDialogPort {
  /**
   * User-authorized attachment pick. Both hosts implement it via the DOM file
   * input — it grants the renderer File objects only, never filesystem scope.
   */
  pickAttachments: (options?: HostAttachmentPickOptions) => Promise<HostResult<File[]>>;
  /** Native folder picker; web has no equivalent path-returning dialog. */
  selectFolder: (params?: {
    defaultPath?: string;
    title?: string;
  }) => Promise<HostResult<HostFolderPick | undefined>>;
}

export interface HostNotificationPort {
  setBadgeCount: (count: number) => Promise<HostResult<void>>;
  show: (params: ShowDesktopNotificationParams) => Promise<HostResult<DesktopNotificationResult>>;
}

export interface HostShellPort {
  /** Apps installed on THIS host's machine (editors / file managers / terminals). */
  detectApps: () => Promise<HostResult<DetectAppsResult>>;
  /**
   * Launch a host app against a path. The adapter refuses unless
   * `resource.deviceId` equals this shell's resolved local device identity —
   * a path on device B can never open in device A's Finder/IDE.
   */
  openInApp: (params: {
    appId: OpenInAppId;
    resource: HostLocalResourceRef;
  }) => Promise<DeviceOperationResult<OpenInAppResult>>;
}

export interface HostTrayPort {
  setVisible: (visible: boolean) => Promise<HostResult<void>>;
  updateNavigationSnapshot: (snapshot: TrayNavigationSnapshot) => Promise<HostResult<void>>;
}

export interface HostPort {
  readonly context: HostContext;
  readonly dialog: HostDialogPort;
  /**
   * This shell's machine identity after the device handshake: present only on
   * a Desktop whose own machine is a registered device. It is a "this
   * machine" marker, never a default execution target.
   */
  ensureLocalDeviceId: () => Promise<string | undefined>;
  has: (capability: HostCapability) => boolean;
  readonly menu: HostMenuPort;
  readonly notification: HostNotificationPort;
  openExternal: (url: string) => Promise<HostResult<void>>;
  readonly shell: HostShellPort;

  readonly tray: HostTrayPort;
  readonly updater: HostUpdaterPort;
  readonly window: HostWindowPort;
}

const unsupported = <T>(capability: HostCapability): Promise<HostResult<T>> =>
  Promise.resolve(hostUnsupported(capability));

const unsupportedWindowPort = (): HostWindowPort => ({
  close: () => unsupported('window.manage'),
  isAlwaysOnTop: () => unsupported('window.manage'),
  isFullScreen: () => unsupported('window.manage'),
  isMaximized: () => unsupported('window.manage'),
  maximize: () => unsupported('window.manage'),
  minimize: () => unsupported('window.manage'),
  setAlwaysOnTop: () => unsupported('window.manage'),
  setMinimumSize: () => unsupported('window.manage'),
  setSize: () => unsupported('window.manage'),
});

const unsupportedUpdaterPort = (): HostUpdaterPort => ({
  checkUpdate: () => unsupported('app.update'),
  getBuildChannel: () => unsupported('app.update'),
  getUpdateChannel: () => unsupported('app.update'),
  getUpdaterState: () => unsupported('app.update'),
  installUpdateLater: () => unsupported('app.update'),
  installUpdateNow: () => unsupported('app.update'),
  setUpdateChannel: () => unsupported('app.update'),
});

const unsupportedMenuPort = (): HostMenuPort => ({
  closePopupContextMenu: () => unsupported('menu.native'),
  popupContextMenu: () => unsupported('menu.native'),
  showContextMenu: () => unsupported('menu.native'),
});

const unsupportedNotificationPort = (): HostNotificationPort => ({
  setBadgeCount: () => unsupported('notification.native'),
  show: () => unsupported('notification.native'),
});

const unsupportedTrayPort = (): HostTrayPort => ({
  setVisible: () => unsupported('tray.manage'),
  updateNavigationSnapshot: () => unsupported('tray.manage'),
});

/**
 * Shared helpers for adapters: every "not supported here" answer goes through
 * these so call surfaces stay honest and identical across hosts.
 */
export const hostPortUnsupported = {
  menu: unsupportedMenuPort,
  notification: unsupportedNotificationPort,
  tray: unsupportedTrayPort,
  updater: unsupportedUpdaterPort,
  window: unsupportedWindowPort,
};

let registered: HostPort | undefined;

/**
 * Fail-closed default used when no entry has registered a host yet (SSR,
 * storybook, bare unit tests): reports `kind: 'web'` with no capabilities,
 * so every capability query and call answers "unsupported" rather than
 * crashing or pretending a shell exists.
 */
const createUnsupportedHost = (): HostPort => ({
  context: { capabilities: new Set<HostCapability>(), kind: 'web' },
  dialog: {
    pickAttachments: () => unsupported('file.pickAttachment'),
    selectFolder: () => unsupported('dialog.openFile'),
  },
  ensureLocalDeviceId: () => Promise.resolve(undefined),
  has: () => false,
  menu: unsupportedMenuPort(),
  notification: unsupportedNotificationPort(),
  openExternal: () => unsupported('link.openExternal'),
  shell: {
    detectApps: () => unsupported('shell.openTerminal'),
    openInApp: () =>
      Promise.resolve({
        error: deviceOperationError('OPERATION_UNSUPPORTED'),
        status: 'error',
      }),
  },
  tray: unsupportedTrayPort(),
  updater: unsupportedUpdaterPort(),
  window: unsupportedWindowPort(),
});

/**
 * Called by a composition root (entry.web.tsx / entry.desktop.tsx) exactly
 * once, before the app renders. Re-registering replaces the port — entries
 * are the only legitimate callers.
 */
export const registerHostPort = (port: HostPort): void => {
  registered = port;
};

export const getHostPort = (): HostPort => registered ?? createUnsupportedHost();

export const getHostContext = (): HostContext => getHostPort().context;

export const hasHostCapability = (capability: HostCapability): boolean =>
  getHostPort().has(capability);

/** Test helpers — inject/clear a fake port without booting an entry. */
export const setHostPortForTesting = (port: HostPort | undefined): void => {
  registered = port;
};
