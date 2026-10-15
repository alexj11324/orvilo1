import { app } from 'electron';

import type { ProtocolUrlParsed } from '../types/protocol';

export type AppChannel = 'stable' | 'beta' | 'nightly';

export const getProtocolScheme = (): string => {
  // In Electron environment, version can be determined in multiple ways
  const bundleId = app.name;
  const appPath = app.getPath('exe');

  // Determine by bundle identifier
  if (bundleId?.toLowerCase().includes('nightly')) return 'orvilo-nightly';
  if (bundleId?.toLowerCase().includes('beta')) return 'orvilo-beta';
  if (bundleId?.includes('dev')) return 'orvilo-dev';

  // Determine by executable file path
  if (appPath?.toLowerCase().includes('nightly')) return 'orvilo-nightly';
  if (appPath?.toLowerCase().includes('beta')) return 'orvilo-beta';
  if (appPath?.includes('dev')) return 'orvilo-dev';

  return 'orvilo';
};

export const getVersionInfo = (): { channel: AppChannel; protocolScheme: string } => {
  const protocolScheme = getProtocolScheme();

  let appChannel: AppChannel = 'stable';
  if (protocolScheme.includes('nightly')) {
    appChannel = 'nightly';
  } else if (protocolScheme.includes('beta')) {
    appChannel = 'beta';
  }

  return {
    channel: appChannel,
    protocolScheme,
  };
};

/**
 * Parse orvilo:// protocol URL (supports multi-version protocols)
 *
 * @param url Protocol URL
 * @returns Parse result, including basic structure and all query parameters
 */
export const parseProtocolUrl = (url: string): ProtocolUrlParsed | null => {
  try {
    const parsedUrl = new URL(url);

    // Support multiple protocol schemes
    const validProtocols = ['orvilo:', 'orvilo-dev:', 'orvilo-nightly:', 'orvilo-beta:'];
    if (!validProtocols.includes(parsedUrl.protocol)) {
      return null;
    }

    // For custom protocols, after URL parsing:
    // orvilo://plugin/install -> hostname: "plugin", pathname: "/install"
    const urlType = parsedUrl.hostname; // "plugin"
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean); // ["install"]

    if (pathParts.length < 1) {
      return null;
    }

    const action = pathParts[0]; // "install"

    // Parse all query parameters
    const params: Record<string, string> = {};
    const searchParams = new URLSearchParams(parsedUrl.search);

    for (const [key, value] of searchParams.entries()) {
      params[key] = value;
    }

    return {
      action,
      originalUrl: url,
      params,
      urlType,
    };
  } catch (error) {
    console.error('Failed to parse protocol URL:', error);
    return null;
  }
};
