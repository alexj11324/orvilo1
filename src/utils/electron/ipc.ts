import { type DesktopIpcServices } from '@orvilo/desktop-ipc-typings';
import { getElectronIpc } from '@orvilo/electron-client-ipc';

export const ensureElectronIpc = (): DesktopIpcServices => {
  const ipc = getElectronIpc();
  if (!ipc) {
    throw new Error(
      'electronAPI.invoke not found. Ensure the preload exposes invoke via window.electronAPI.invoke',
    );
  }
  return ipc;
};
