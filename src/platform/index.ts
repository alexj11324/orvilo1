/**
 * Platform host layer — shared surface only.
 *
 * `./desktop` is deliberately NOT re-exported: it is the only adapter allowed
 * to import Electron services, and only `src/spa/entry.desktop.tsx` may
 * import it. Re-exporting it here would pull the Electron service graph into
 * every importer of this barrel — including the web bundle.
 */
export type {
  HostAttachmentPickOptions,
  HostDialogPort,
  HostFolderPick,
  HostLocalResourceRef,
  HostMenuPort,
  HostNotificationPort,
  HostPort,
  HostResult,
  HostShellPort,
  HostTrayPort,
  HostUpdaterPort,
  HostWindowPort,
} from './host';
export {
  getHostContext,
  getHostPort,
  hasHostCapability,
  hostResultOr,
  registerHostPort,
  setHostPortForTesting,
} from './host';
export { createWebHostPort } from './web';
