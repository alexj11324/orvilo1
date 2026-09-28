import { isDesktop } from '@orvilo/const';
import { type PartialDeep } from 'type-fest';

import { type VersionResponseData } from '@/app/(backend)/api/version/route';
import { BusinessGlobalService } from '@/business/client/services/BusinessGlobalService';
import { lambdaClient } from '@/libs/trpc/client';
import { getElectronStoreState } from '@/store/electron';
import { electronSyncSelectors } from '@/store/electron/selectors';
import { type OrviloAgentConfig } from '@/types/agent';
import { type GlobalRuntimeConfig } from '@/types/serverConfig';

// Orvilo's own release feed — the upstream product's package feed must not
// drive our "update available" badge.
const VERSION_URL = 'https://api.github.com/repos/alexj11324/orvilo1/releases/latest';
const SERVER_VERSION_URL = '/api/version';

class GlobalService extends BusinessGlobalService {
  /**
   * get latest release version from the Orvilo GitHub releases feed
   */
  getLatestVersion = async (): Promise<string> => {
    const res = await fetch(VERSION_URL);
    const data = await res.json();

    return data['tag_name'];
  };

  /**
   * get server version from /api/version
   * @returns version string if available, null only if server returns 404 (API doesn't exist on old server)
   * @throws Error for other failures (network errors, 500s, etc.) to allow SWR retry
   */
  getServerVersion = async (): Promise<string | null> => {
    const origin = (() => {
      if (isDesktop) {
        const remoteServerUrl = electronSyncSelectors.remoteServerUrl(getElectronStoreState());
        if (!remoteServerUrl) return undefined;

        try {
          return new URL(remoteServerUrl).origin;
        } catch {
          // fallback: use as-is; URL construction below will throw if invalid
          return remoteServerUrl;
        }
      }

      return undefined;
    })();

    if (!origin) return null;

    const url = new URL(SERVER_VERSION_URL, origin).toString();
    const res = await fetch(url);

    // Only treat 404 as "server doesn't support version API"
    // Other errors (500, network issues) should throw to allow retry
    if (res.status === 404) {
      return null;
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch server version: ${res.status}`);
    }

    const data: VersionResponseData = await res.json();

    return data.version;
  };

  getGlobalConfig = async (): Promise<GlobalRuntimeConfig> => {
    return lambdaClient.config.getGlobalConfig.query();
  };

  getDefaultAgentConfig = async (): Promise<PartialDeep<OrviloAgentConfig>> => {
    return lambdaClient.config.getDefaultAgentConfig.query();
  };
}

export const globalService = new GlobalService();
