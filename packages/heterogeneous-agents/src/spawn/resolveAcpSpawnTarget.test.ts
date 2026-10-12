import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as acpRuntime from './acpRuntime';

const { detectAcpBridgeCommandMock, detectAcpBridgeRunnerMock } = vi.hoisted(() => ({
  detectAcpBridgeCommandMock: vi.fn(),
  detectAcpBridgeRunnerMock: vi.fn(),
}));

vi.mock('./acpRuntime', async (importOriginal) => ({
  ...(await importOriginal<typeof acpRuntime>()),
  detectAcpBridgeCommand: detectAcpBridgeCommandMock,
  detectAcpBridgeRunner: detectAcpBridgeRunnerMock,
}));

const importModule = () => import('./standardAcpAgents');

describe('resolveAcpSpawnTarget with a missing bridge', () => {
  beforeEach(() => {
    detectAcpBridgeCommandMock.mockReset().mockResolvedValue({ available: false });
    detectAcpBridgeRunnerMock
      .mockReset()
      .mockResolvedValue({ args: ['-y', 'bridge'], commandPath: '/usr/bin/npx' });
  });

  it('falls back to a package runner for a run', async () => {
    const { resolveAcpSpawnTarget } = await importModule();

    const target = await resolveAcpSpawnTarget('claude-code', '/bin/claude', {});

    expect(target.commandPath).toBe('/usr/bin/npx');
  });

  it('fails instead of fetching the bridge when the caller forbids the runner', async () => {
    const { resolveAcpSpawnTarget } = await importModule();

    await expect(
      resolveAcpSpawnTarget('claude-code', '/bin/claude', {}, { allowPackageRunner: false }),
    ).rejects.toMatchObject({ name: 'AcpBridgeNotFoundError' });
    expect(detectAcpBridgeRunnerMock).not.toHaveBeenCalled();
  });
});
