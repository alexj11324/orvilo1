import type { DesktopIpcServices } from './controllers/registry';

declare module '@orvilo/electron-client-ipc' {
  interface DesktopIpcServicesMap extends DesktopIpcServices {}
}

export { type DesktopIpcServices } from './controllers/registry';
