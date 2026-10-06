import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { PRIME_EMBEDDED_PIN } from '@orvilo/agent-execution/controlPlane/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { executeToolCall } from './index';

const { resolveArtifact } = vi.hoisted(() => ({
  resolveArtifact: vi.fn(() => null as string | null),
}));
vi.mock('../device/primeRun', () => ({ resolvePrimeRunnerArtifact: resolveArtifact }));

// Isolate unrelated local tool runtimes while exercising the real readiness
// validation, host probe and gateway serialization through executeToolCall.
vi.mock('../utils/logger', () => ({ log: { error: vi.fn() } }));
vi.mock('./checkPlatformCapability', () => ({ checkPlatformCapability: vi.fn() }));
vi.mock('./getAgentProfile', () => ({ getAgentProfile: vi.fn() }));
vi.mock('./heteroTask', () => ({ cancelHeteroTask: vi.fn(), runHeteroTask: vi.fn() }));
vi.mock('./isolatedWorker', () => ({
  executeToolCallInWorker: vi.fn(),
  shouldRunInWorker: () => false,
}));
vi.mock('./localSystemRuntime', () => ({ runLocalSystemTool: async () => null }));
vi.mock('./scanHeterogeneousAgents', () => ({ scanHeterogeneousAgents: vi.fn() }));

describe('automation readiness gateway contract', () => {
  const temporary: string[] = [];
  afterEach(async () => {
    resolveArtifact.mockReturnValue(null);
    await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });
  const artifactFixture = async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'cli-prime-readiness-'));
    temporary.push(dir);
    const artifact = path.join(dir, 'runner.mjs');
    const content = 'throw new Error("Readiness must not execute a runner");';
    await writeFile(artifact, content);
    await writeFile(
      path.join(dir, 'runner.manifest.json'),
      JSON.stringify({
        artifact: 'runner.mjs',
        bytes: Buffer.byteLength(content),
        prime: PRIME_EMBEDDED_PIN,
        schemaVersion: 1,
        sha256: createHash('sha256').update(content).digest('hex'),
      }),
    );
    return artifact;
  };

  it('verifies the execution-resolved artifact through the actual CLI dispatcher without running it', async () => {
    const artifact = await artifactFixture();
    resolveArtifact.mockReturnValue(artifact);
    const result = await executeToolCall(
      'checkAutomationReadiness',
      JSON.stringify({ agentType: 'orvilo' }),
    );
    expect(result.success).toBe(true);
    expect(JSON.parse(result.content)).toMatchObject({
      installed: true,
      unattended: true,
      authenticated: 'unknown',
    });
  });

  it('rejects a tampered execution artifact and ignores artifact paths in remote requests', async () => {
    const artifact = await artifactFixture();
    resolveArtifact.mockReturnValue(artifact);
    await writeFile(artifact, 'export const changed = true;');
    const result = await executeToolCall(
      'checkAutomationReadiness',
      JSON.stringify({ agentType: 'orvilo' }),
    );
    expect(JSON.parse(result.content).installed).toBe(false);
    resolveArtifact.mockReturnValue(null);
    const ignored = await executeToolCall(
      'checkAutomationReadiness',
      JSON.stringify({ agentType: 'orvilo', primeArtifact: artifact }),
    );
    expect(JSON.parse(ignored.content).installed).toBe(false);
  });
  it('serializes host evidence through the actual CLI handler without a run', async () => {
    const result = await executeToolCall(
      'checkAutomationReadiness',
      JSON.stringify({ agentType: 'native', requiredTools: ['writeIssue'] }),
      5000,
    );
    expect(result.success).toBe(true);
    expect(JSON.parse(result.content)).toMatchObject({
      authenticated: 'unknown',
      executor: 'prime',
      repositoryAccessible: true,
      requiredToolsSupported: 'unknown',
      unattended: true,
      installed: false,
    });
    expect(JSON.parse(result.content).checkedAt).toEqual(expect.any(String));
  });

  it('returns a failure envelope for invalid readiness requests', async () => {
    const result = await executeToolCall('checkAutomationReadiness', '{}');
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});
