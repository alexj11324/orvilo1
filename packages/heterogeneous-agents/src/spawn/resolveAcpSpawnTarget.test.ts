import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as acpRuntime from './acpRuntime';
import type * as standardAcpAgents from './standardAcpAgents';

const { detectAcpBridgeCommandMock, detectAcpBridgeRunnerMock } = vi.hoisted(() => ({
  detectAcpBridgeCommandMock: vi.fn(),
  detectAcpBridgeRunnerMock: vi.fn(),
}));

vi.mock('./acpRuntime', async (importOriginal) => ({
  ...(await importOriginal<typeof acpRuntime>()),
  detectAcpBridgeCommand: detectAcpBridgeCommandMock,
  detectAcpBridgeRunner: detectAcpBridgeRunnerMock,
}));

const env = {} as NodeJS.ProcessEnv;
let resolveAcpSpawnTarget: (typeof standardAcpAgents)['resolveAcpSpawnTarget'];

describe('resolveAcpSpawnTarget with a missing bridge', () => {
  // The module graph is large; load it once, outside the per-test timeout.
  beforeAll(async () => {
    ({ resolveAcpSpawnTarget } = await import('./standardAcpAgents'));
  }, 30_000);

  beforeEach(() => {
    detectAcpBridgeCommandMock.mockReset().mockResolvedValue({ available: false });
    detectAcpBridgeRunnerMock
      .mockReset()
      .mockResolvedValue({ args: ['-y', 'bridge'], commandPath: '/usr/bin/npx' });
  });

  it('falls back to a package runner for a run', async () => {
    const target = await resolveAcpSpawnTarget('claude-code', '/bin/claude', env);

    expect(target.commandPath).toBe('/usr/bin/npx');
  });

  it('fails instead of fetching the bridge when the caller forbids the runner', async () => {
    await expect(
      resolveAcpSpawnTarget('claude-code', '/bin/claude', env, { allowPackageRunner: false }),
    ).rejects.toMatchObject({ name: 'AcpBridgeNotFoundError' });
    expect(detectAcpBridgeRunnerMock).not.toHaveBeenCalled();
  });
});
