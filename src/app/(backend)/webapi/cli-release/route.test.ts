// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mocks = vi.hoisted(() => ({ getCliReleaseDownload: vi.fn() }));

vi.mock('@/server/services/desktopRelease', () => mocks);

describe('GET /webapi/cli-release', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the verified public asset metadata without authentication', async () => {
    const release = {
      assetName: 'orvilo-cli-2.7.0.tgz',
      publishedAt: '2026-10-04T12:00:00Z',
      tag: 'v2.7.0',
      url: 'https://github.com/alexj11324/orvilo1/releases/download/v2.7.0/orvilo-cli-2.7.0.tgz',
      version: '2.7.0',
    };
    mocks.getCliReleaseDownload.mockResolvedValue(release);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(release);
  });

  it('returns an explicit unavailable state when the release has no CLI package', async () => {
    mocks.getCliReleaseDownload.mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ available: false });
  });

  it('reports upstream failure without exposing internal error details', async () => {
    mocks.getCliReleaseDownload.mockRejectedValue(new Error('private upstream diagnostic'));

    const response = await GET();

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      available: false,
      error: 'CLI release information is unavailable',
    });
  });
});
