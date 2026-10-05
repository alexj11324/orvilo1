import { afterEach, describe, expect, it, vi } from 'vitest';

import { buildInstallCommand, fetchLatestRelease, isNewerVersion } from './update';

describe('GitHub CLI release updates', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the version and install URL of the published CLI asset', async () => {
    const spec =
      'https://github.com/alexj11324/orvilo1/releases/download/v2.7.0/orvilo-cli-2.7.0.tgz';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          assets: [{ browser_download_url: spec, name: 'orvilo-cli-2.7.0.tgz' }],
        }),
      ),
    );

    expect(await fetchLatestRelease('latest')).toEqual({ spec, version: '2.7.0' });
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/alexj11324/orvilo1/releases/latest',
    );
    expect(buildInstallCommand('npm', spec).args).toEqual(['install', '-g', spec]);
  });

  it('reports a release without a CLI asset instead of attempting the absent npm package', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ assets: [] })));
    await expect(fetchLatestRelease('latest')).rejects.toThrow(
      'does not include an installable CLI package',
    );
  });

  it('rejects assets outside the repository release downloads', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          assets: [
            { browser_download_url: 'https://example.com/cli.tgz', name: 'orvilo-cli-2.7.0.tgz' },
          ],
        }),
      ),
    );
    await expect(fetchLatestRelease('latest')).rejects.toThrow(
      'does not include an installable CLI package',
    );
  });

  it('queries an explicit release tag and reports API failures', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('', { status: 404 }));
    await expect(fetchLatestRelease('v2.7.0')).rejects.toThrow(
      'GitHub Releases returned status 404',
    );
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/alexj11324/orvilo1/releases/tags/v2.7.0',
    );
  });
});

describe('isNewerVersion', () => {
  it('compares core versions', () => {
    expect(isNewerVersion('1.2.3', '1.2.2')).toBe(true);
    expect(isNewerVersion('1.2.2', '1.2.3')).toBe(false);
    expect(isNewerVersion('1.2.3', '1.2.3')).toBe(false);
    expect(isNewerVersion('2.0.0', '1.9.9')).toBe(true);
  });

  it('tolerates a leading v and missing segments', () => {
    expect(isNewerVersion('v1.2.0', '1.2.0')).toBe(false);
    expect(isNewerVersion('1.2', '1.2.0')).toBe(false);
    expect(isNewerVersion('1.3', '1.2.9')).toBe(true);
  });

  it('ranks a stable release above a prerelease of the same core', () => {
    expect(isNewerVersion('1.2.3', '1.2.3-beta.1')).toBe(true);
    expect(isNewerVersion('1.2.3-beta.1', '1.2.3')).toBe(false);
    expect(isNewerVersion('1.2.3-beta.2', '1.2.3-beta.1')).toBe(true);
    expect(isNewerVersion('1.2.3-beta.1', '1.2.3-beta.1')).toBe(false);
  });

  it('orders numeric prerelease identifiers numerically, not lexicographically', () => {
    // The bug a raw string compare gets wrong: beta.10 must outrank beta.9.
    expect(isNewerVersion('1.0.0-beta.10', '1.0.0-beta.9')).toBe(true);
    expect(isNewerVersion('1.0.0-beta.9', '1.0.0-beta.10')).toBe(false);
    expect(isNewerVersion('1.0.0-beta.2', '1.0.0-beta.10')).toBe(false);
  });

  it('returns false for an unparseable latest version', () => {
    expect(isNewerVersion('not-a-version', '1.0.0')).toBe(false);
  });
});

describe('buildInstallCommand', () => {
  it('builds the global install command per package manager', () => {
    expect(buildInstallCommand('npm', '@orvilo/cli@1.0.0')).toEqual({
      args: ['install', '-g', '@orvilo/cli@1.0.0'],
      command: 'npm',
    });
    expect(buildInstallCommand('pnpm', '@orvilo/cli@1.0.0')).toEqual({
      args: ['add', '-g', '@orvilo/cli@1.0.0'],
      command: 'pnpm',
    });
    expect(buildInstallCommand('bun', '@orvilo/cli@1.0.0')).toEqual({
      args: ['add', '-g', '@orvilo/cli@1.0.0'],
      command: 'bun',
    });
    expect(buildInstallCommand('yarn', '@orvilo/cli@1.0.0')).toEqual({
      args: ['global', 'add', '@orvilo/cli@1.0.0'],
      command: 'yarn',
    });
  });
});
