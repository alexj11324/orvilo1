import type { UpdateInfo } from '@orvilo/electron-client-ipc';

export const selectUpdateInfo = (current: UpdateInfo | null, incoming: UpdateInfo): UpdateInfo =>
  current?.kind === 'app' && incoming.kind === 'renderer' ? current : incoming;
