import type { UpdateChannel } from '@orvilo/electron-client-ipc';

import { isDev } from '@/const/env';
import { getDesktopEnv } from '@/env';

// Build-time default channel, can be overridden at runtime via store
const rawChannel = getDesktopEnv().UPDATE_CHANNEL || 'stable';
export const coerceStoredUpdateChannel = (channel?: string | null): UpdateChannel =>
  channel === 'canary' ? 'canary' : 'stable';

/** Raw build channel for display (stable, canary, beta, or legacy nightly). */
export const BUILD_CHANNEL: string = rawChannel;
export const UPDATE_CHANNEL: UpdateChannel =
  rawChannel === 'canary' || rawChannel === 'beta' ? 'canary' : 'stable';

// Installer update URL. When unset, electron-updater uses the GitHub provider.
export const UPDATE_SERVER_URL = getDesktopEnv().UPDATE_SERVER_URL;

// Renderer OTA may remain on a static object store while installers use GitHub Releases.
// Keep the old URL as a fallback for existing generic-provider deployments.
export const RENDERER_OTA_SERVER_URL = getDesktopEnv().RENDERER_OTA_SERVER_URL || UPDATE_SERVER_URL;

export const updaterConfig = {
  app: {
    autoCheckUpdate: true,
    autoDownloadUpdate: true,
    checkUpdateInterval: 60 * 60 * 1000, // 1 hour
  },
  enableAppUpdate: !isDev,
};
