import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import type { AgentState } from './types';
import { normalizeAgentState } from './utils/normalizeAgentState';
import { isParkedStatus } from './utils/status';

const SRC = __dirname;

const collectSources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSources(filePath);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [filePath] : [];
  });

const sourceFiles = collectSources(SRC);
const sources = sourceFiles.map((path) => readFileSync(path, 'utf8'));

/**
 * Symbols that belong to the retired in-process engine loop. The contract
 * package must never expose them — an engine import here is how the old loop
 * sneaks back as a "shared type".
 */
const ENGINE_ONLY_EXPORTS = [
  'AgentInstruction',
  'ContextBuilder',
  'GeneralAgentCallLLMInstructionPayload',
  'InstructionExecutor',
  'LLMTransport',
  'RuntimeTransports',
];

describe('contract boundary', () => {
  it('does not depend on the retired engine package', () => {
    const offenders = sourceFiles.filter((_, i) => sources[i].includes('@orvilo/agent-runtime'));
    expect(offenders).toEqual([]);
  });

  it('does not export engine-loop contracts', () => {
    for (const symbol of ENGINE_ONLY_EXPORTS) {
      const pattern = new RegExp(`export (type |interface |class |const )?.*\\b${symbol}\\b`);
      const offenders = sourceFiles.filter((_, i) => pattern.test(sources[i]));
      expect(offenders, `unexpected export of ${symbol}`).toEqual([]);
    }
  });

  it('round-trips a persisted state blob and lifts legacy metadata keys', () => {
    const persisted = JSON.stringify({
      cost: {},
      createdAt: '2026-01-01T00:00:00.000Z',
      lastModified: '2026-01-01T00:00:00.000Z',
      messages: [],
      metadata: {
        agentId: 'agent-1',
        customKey: 'kept',
        isSubAgent: true,
        modelRuntimeConfig: { model: 'm', provider: 'p' },
        topicId: 'topic-1',
      },
      operationId: 'op-1',
      status: 'waiting_for_async_tool',
      stepCount: 3,
      toolManifestMap: {},
      usage: {},
    });

    const decoded = normalizeAgentState(JSON.parse(persisted) as AgentState);

    expect(decoded.origin?.topicId).toBe('topic-1');
    expect(decoded.origin?.agentId).toBe('agent-1');
    expect(decoded.origin?.lineage?.isSubAgent).toBe(true);
    expect(decoded.modelRuntimeConfig).toEqual({ model: 'm', provider: 'p' });
    expect(decoded.metadata).toEqual({ customKey: 'kept' });
    expect(isParkedStatus(decoded.status)).toBe(true);
    // Serialized form stays JSON-safe for the next write.
    expect(() => JSON.stringify(decoded)).not.toThrow();
  });
});
