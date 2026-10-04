import { afterEach, describe, expect, it, vi } from 'vitest';

import { type DesktopDownloadType } from './index';
import {
  getLatestDesktopReleaseFromGithub,
  resolveCliReleaseDownload,
  resolveDesktopDownload,
  resolveDesktopDownloadFromUrls,
} from './index';

const mockRelease = {
  assets: [
    {
      browser_download_url: 'https://example.com/Orvilo-2.0.0-arm64.dmg',
      name: 'Orvilo-2.0.0-arm64.dmg',
    },
    {
      browser_download_url: 'https://example.com/Orvilo-2.0.0-x64.dmg',
      name: 'Orvilo-2.0.0-x64.dmg',
    },
    {
      browser_download_url: 'https://example.com/Orvilo-2.0.0-setup.exe',
      name: 'Orvilo-2.0.0-setup.exe',
    },
    {
      browser_download_url: 'https://example.com/Orvilo-2.0.0.AppImage',
      name: 'Orvilo-2.0.0.AppImage',
    },
  ],
  published_at: '2026-01-01T00:00:00.000Z',
  tag_name: 'v2.0.0',
};

describe('desktopRelease', () => {
  it.each([
    ['mac-arm', 'Orvilo-2.0.0-arm64.dmg'],
    ['mac-intel', 'Orvilo-2.0.0-x64.dmg'],
    ['windows', 'Orvilo-2.0.0-setup.exe'],
    ['linux', 'Orvilo-2.0.0.AppImage'],
  ] as Array<[DesktopDownloadType, string]>)(
    'resolveDesktopDownload(%s)',
    (type, expectedAssetName) => {
      const resolved = resolveDesktopDownload(mockRelease as any, type);
      expect(resolved?.assetName).toBe(expectedAssetName);
      expect(resolved?.version).toBe('2.0.0');
      expect(resolved?.tag).toBe('v2.0.0');
      expect(resolved?.type).toBe(type);
      expect(resolved?.url).toContain(expectedAssetName);
    },
  );

  it('resolveDesktopDownloadFromUrls should match basename', () => {
    const resolved = resolveDesktopDownloadFromUrls({
      publishedAt: '2026-01-01T00:00:00.000Z',
      tag: 'v2.0.0',
      type: 'windows',
      urls: [
        'https://releases.example.com/stable/2.0.0/Orvilo-2.0.0-setup.exe?download=1',
        'https://releases.example.com/stable/2.0.0/Orvilo-2.0.0-x64.dmg',
      ],
      version: '2.0.0',
    });

    expect(resolved?.assetName).toBe('Orvilo-2.0.0-setup.exe');
    expect(resolved?.url).toContain('setup.exe');
  });
});

describe('CLI release downloads', () => {
  const assetName = 'orvilo-cli-2.7.0.tgz';
  const url = `https://github.com/alexj11324/orvilo1/releases/download/v2.7.0/${assetName}`;
  const release = {
    assets: [{ browser_download_url: url, name: assetName }],
    published_at: '2026-10-04T12:00:00Z',
    tag_name: 'v2.7.0',
  };

  afterEach(() => vi.restoreAllMocks());

  it('returns the actual CLI asset and its package version', () => {
    expect(resolveCliReleaseDownload(release)).toEqual({
      assetName,
      publishedAt: release.published_at,
      tag: release.tag_name,
      url,
      version: '2.7.0',
    });
  });

  it('does not invent a CLI download when the release only contains desktop installers', () => {
    expect(resolveCliReleaseDownload(mockRelease)).toBeNull();
  });

  it('preserves valid package build metadata in the asset version', () => {
    const name = 'orvilo-cli-2.7.0+build.1.tgz';
    expect(
      resolveCliReleaseDownload({
        ...release,
        assets: [
          {
            browser_download_url: `https://github.com/alexj11324/orvilo1/releases/download/v2.7.0/${encodeURIComponent(name)}`,
            name,
          },
        ],
      })?.version,
    ).toBe('2.7.0+build.1');
  });

  it.each([
    'http://github.com/alexj11324/orvilo1/releases/download/v2.7.0/orvilo-cli-2.7.0.tgz',
    'https://example.com/orvilo-cli-2.7.0.tgz',
    'https://github.com/other/repo/releases/download/v2.7.0/orvilo-cli-2.7.0.tgz',
    'https://github.com/alexj11324/orvilo1/releases/download/v2.6.0/orvilo-cli-2.7.0.tgz',
    'https://github.com/alexj11324/orvilo1/releases/download/v2.7.0/other.tgz',
    'https://user:password@github.com/alexj11324/orvilo1/releases/download/v2.7.0/orvilo-cli-2.7.0.tgz',
    'not-a-url',
  ])('rejects an untrusted or mismatched release asset URL: %s', (invalidUrl) => {
    expect(
      resolveCliReleaseDownload({
        ...release,
        assets: [{ browser_download_url: invalidUrl, name: assetName }],
      }),
    ).toBeNull();
  });

  it.each(['orvilo-cli-invalid.tgz', 'orvilo-cli-01.2.3.tgz', 'orvilo-cli-2.7.0.zip'])(
    'rejects invalid CLI package names: %s',
    (name) => {
      expect(
        resolveCliReleaseDownload({ ...release, assets: [{ browser_download_url: url, name }] }),
      ).toBeNull();
    },
  );

  it('supports an explicitly selected candidate release without changing the stable default', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async () => new Response(JSON.stringify(release)));
    await getLatestDesktopReleaseFromGithub({ tag: 'v2.7.0-preview.1' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/alexj11324/orvilo1/releases/tags/v2.7.0-preview.1',
    );
    await getLatestDesktopReleaseFromGithub();
    expect(fetchMock.mock.calls[1][0]).toBe(
      'https://api.github.com/repos/alexj11324/orvilo1/releases/latest',
    );
  });

  it('rejects a malformed configured tag before requesting GitHub', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    await expect(getLatestDesktopReleaseFromGithub({ tag: '../another/repo' })).rejects.toThrow(
      'Invalid release tag',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
