import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Cross-module parity gate (P19): the retirements must not take down the
 * consumers that were meant to survive — stream/tool/approval/cancel wiring,
 * the acceptance evidence tool, connector routes, task evidence. And the
 * retired client-side control surfaces must stay gone.
 *
 * These read wiring as text (same convention as
 * `Settings/features/retiredSettingsSurfaces.test.ts`): assertions hold even
 * when the modules can't be imported in a vitest sandbox.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(REPO_ROOT, 'src');

const readRepo = (relativePath: string) => readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');

const collectSources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSources(filePath);
    return /\.(?:ts|tsx)$/.test(entry.name) &&
      !entry.name.endsWith('.test.ts') &&
      !entry.name.endsWith('.test.tsx')
      ? [filePath]
      : [];
  });

const clientSources = collectSources(SRC).map((filePath) => ({
  path: path.relative(SRC, filePath),
  text: readFileSync(filePath, 'utf8'),
}));

describe('retired client control surfaces stay gone', () => {
  const RETIRED_CLIENT_RULES = [
    { pattern: /\bQuotaAccountManagerModal\b/, reason: 'P06 retired the managed-account modal' },
    {
      pattern: /\bmodelPicker\b|HeterogeneousAgent\/modelPicker/,
      reason: 'P05 retired the hetero model/auth picker',
    },
    { pattern: /claudeQuota\.manage\./, reason: 'P06 deleted the manage-account locale keys' },
    {
      pattern: /heteroAgent\.apiMode\.|heterogeneousStatus\.apiMode\.|heterogeneousStatus\.auth\./,
      reason: 'P05 deleted the BYOK auth-mode locale keys',
    },
    {
      pattern: /\bresolveQuotaAccountEnv\b|\bquotaAccountPlan\b/,
      reason: 'P06 retired quota→env injection into execution',
    },
    {
      pattern: /from ['"]@orvilo\/agent-runtime['"]|require\(['"]@orvilo\/agent-runtime['"]/,
      reason: 'the retired in-process engine package has no executable consumers',
    },
  ];

  it('finds no retired identifier in client production sources', () => {
    const violations = clientSources.flatMap(({ path: filePath, text }) =>
      RETIRED_CLIENT_RULES.filter(({ pattern }) => pattern.test(text)).map(
        ({ reason }) => `${filePath} → ${reason}`,
      ),
    );
    expect(violations).toEqual([]);
  });

  it('the guard flags an injected violation', () => {
    const bad = [{ path: 'fake.ts', text: 'openModal(QuotaAccountManagerModal)' }];
    const hits = bad.flatMap(({ path: filePath, text }) =>
      RETIRED_CLIENT_RULES.filter(({ pattern }) => pattern.test(text)).map(
        ({ reason }) => `${filePath} → ${reason}`,
      ),
    );
    expect(hits).not.toEqual([]);
  });
});

describe('retained consumers keep their wiring', () => {
  it('the run-scoped acceptance evidence tool stays registered', () => {
    // HS-14: deleting this makes requiredEvidence tasks un-gateable forever.
    const identifiers = readRepo('packages/builtin-tools/src/identifiers.ts');
    expect(identifiers).toContain('builtin-tool-acceptance-evidence');
    expect(identifiers).toContain('AcceptanceEvidenceManifest.identifier');
    const manifest = readRepo('packages/builtin-tool-acceptance-evidence/src/manifest.ts');
    expect(manifest).toContain("'orvilo-acceptance-evidence'");
  });

  it('keeps the ACP stream/tool lifecycle vocabulary', () => {
    const types = readRepo('packages/heterogeneous-agents/src/types.ts');
    const union = types.match(/export type HeterogeneousEventType\s*=([\s\S]*?);/);
    expect(union?.[1]).toBeTruthy();
    for (const member of [
      'stream_start',
      'stream_chunk',
      'stream_end',
      'tool_start',
      'tool_end',
      'tool_result',
      'step_complete',
      'agent_runtime_end',
      'error',
    ]) {
      expect(union![1], `event type ${member} removed`).toContain(`'${member}'`);
    }
  });

  it('keeps approval and cancel on the ACP session path', () => {
    const session = readRepo('packages/heterogeneous-agents/src/spawn/standardAcpSession.ts');
    expect(session).toContain("'session/request_permission'");
    expect(session).toContain("'elicitation/create'");
    const base = readRepo('packages/heterogeneous-agents/src/spawn/acpAgentSession.ts');
    expect(base).toContain("'session/cancel'");
  });

  it('keeps the task-scoped acceptance consumer on the client service', () => {
    const verify = readRepo('src/services/verify.ts');
    expect(verify).toContain('acceptance.getBySubject');
    expect(
      lstatSync(path.join(REPO_ROOT, 'src/services/verify.ts'), { throwIfNoEntry: false }),
    ).toBeDefined();
  });

  it('keeps every hetero chat transport: desktop, web-bound device, server sandbox', () => {
    const executor = readRepo(
      'src/store/chat/slices/agentRun/actions/transports/hetero/heterogeneousAgentExecutor.ts',
    );
    expect(executor).toBeTruthy();
    const dispatch = readRepo('apps/server/src/services/aiAgent/pipeline/heteroDispatch.ts');
    expect(dispatch).toContain('spawnHeteroSandbox');
  });
});
