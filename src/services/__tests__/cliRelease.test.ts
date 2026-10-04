import { afterEach, describe, expect, it, vi } from 'vitest';

import { cliReleaseService } from '../cliRelease';

afterEach(() => vi.restoreAllMocks());

describe('CLI release availability', () => {
  it('returns the verified asset returned by the download endpoint', async () => {
    const asset = {
      assetName: 'orvilo-cli-0.0.54.tgz',
      url: 'https://github.com/alexj11324/orvilo1/releases/download/v2.6.1/orvilo-cli-0.0.54.tgz',
      tag: 'v2.6.1',
      version: '2.6.1',
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json(asset));
    expect(await cliReleaseService.getLatest()).toEqual(asset);
  });

  it('returns an unavailable state when the release has no CLI asset', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ available: false }, { status: 404 }),
    );
    expect(await cliReleaseService.getLatest()).toBeNull();
  });

  it('keeps lookup failures retryable instead of pretending an asset exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json({ available: false }, { status: 502 }),
    );
    await expect(cliReleaseService.getLatest()).rejects.toThrow(
      'CLI release information is unavailable',
    );
  });
});
