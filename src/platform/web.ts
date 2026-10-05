import type { HostCapability, HostContext, HostKind } from '@orvilo/types';
import { deviceOperationError, hostUnsupported } from '@orvilo/types';

import { pickFilesViaDomInput } from './domFilePick';
import type { HostPort } from './host';
import { hostPortUnsupported } from './host';

const WEB_CAPABILITIES: ReadonlySet<HostCapability> = new Set([
  'file.pickAttachment',
  'link.openExternal',
]);

const webContext = (kind: HostKind): HostContext => ({
  capabilities: WEB_CAPABILITIES,
  kind,
});

/**
 * Browser-family host adapter (web, mobile web, popup shells without a
 * native preload). Implements exactly the capabilities such a shell honestly
 * has; everything else answers HOST_UNSUPPORTED — no swallowed exceptions,
 * no fake success.
 */
export const createWebHostPort = (
  kind: Extract<HostKind, 'mobile' | 'popup' | 'web'> = 'web',
): HostPort => ({
  context: webContext(kind),
  dialog: {
    pickAttachments: (options) => pickFilesViaDomInput(options),
    selectFolder: () => Promise.resolve(hostUnsupported('dialog.openFile')),
  },
  ensureLocalDeviceId: () => Promise.resolve(undefined),
  has: (capability) => WEB_CAPABILITIES.has(capability),
  menu: hostPortUnsupported.menu(),
  notification: hostPortUnsupported.notification(),
  openExternal: (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
    return Promise.resolve();
  },
  shell: {
    detectApps: () => Promise.resolve(hostUnsupported('shell.openTerminal')),
    openInApp: () =>
      Promise.resolve({
        error: deviceOperationError(
          'OPERATION_UNSUPPORTED',
          undefined,
          'A browser host cannot launch local apps.',
        ),
        status: 'error',
      }),
  },
  tray: hostPortUnsupported.tray(),
  updater: hostPortUnsupported.updater(),
  window: hostPortUnsupported.window(),
});
