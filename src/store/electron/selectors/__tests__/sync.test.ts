import { OFFICIAL_DOMAIN, OFFICIAL_URL } from '@orvilo/const';
import { describe, expect, it } from 'vitest';

import { type ElectronState, initialState } from '../../initialState';
import { electronSyncSelectors } from '../sync';

const withConfig = (dataSyncConfig: ElectronState['dataSyncConfig']): ElectronState => ({
  ...initialState,
  dataSyncConfig,
});

describe('electronSyncSelectors.isOfficialServer', () => {
  it('is official in cloud mode regardless of remoteServerUrl', () => {
    expect(
      electronSyncSelectors.isOfficialServer(
        withConfig({ remoteServerUrl: 'http://localhost:3210', storageMode: 'cloud' }),
      ),
    ).toBe(true);
  });

  it('is official when self-hosting on the official origin', () => {
    expect(
      electronSyncSelectors.isOfficialServer(
        withConfig({ remoteServerUrl: OFFICIAL_URL, storageMode: 'selfHost' }),
      ),
    ).toBe(true);
  });

  it('is official for the official apex domain and any of its subdomains', () => {
    const officialOrigins = [
      `https://${OFFICIAL_DOMAIN}`,
      `https://api.${OFFICIAL_DOMAIN}`,
      `https://accounts.${OFFICIAL_DOMAIN}`,
    ];

    for (const remoteServerUrl of officialOrigins) {
      expect(
        electronSyncSelectors.isOfficialServer(
          withConfig({ remoteServerUrl, storageMode: 'selfHost' }),
        ),
      ).toBe(true);
    }
  });

  it('is not official for a host that merely ends with the official domain', () => {
    expect(
      electronSyncSelectors.isOfficialServer(
        withConfig({ remoteServerUrl: `https://not-${OFFICIAL_DOMAIN}`, storageMode: 'selfHost' }),
      ),
    ).toBe(false);
  });

  it('is not official for a third-party self-hosted server', () => {
    expect(
      electronSyncSelectors.isOfficialServer(
        withConfig({ remoteServerUrl: 'https://chat.example.com', storageMode: 'selfHost' }),
      ),
    ).toBe(false);
  });
});
