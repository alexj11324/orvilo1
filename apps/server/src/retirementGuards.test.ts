import { lstatSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Anti-resurrection gate for the P05/P06 server-side retirements, plus the
 * parity half: the registrations and procedure surface every retained
 * capability still needs.
 *
 * Structural assertions over production sources (not imports) — a rebase or
 * cherry-pick that quietly restores a retired endpoint fails here. The
 * falsifiability suite proves each guard actually turns red when a violation
 * is injected.
 */

const SERVER_SRC = path.resolve(import.meta.dirname);
const REPO_ROOT = path.resolve(SERVER_SRC, '../../..');

const collectSources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSources(filePath);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [filePath] : [];
  });

const serverSources = collectSources(SERVER_SRC).map((filePath) => ({
  path: path.relative(SERVER_SRC, filePath),
  text: readFileSync(filePath, 'utf8'),
}));

const readRepo = (relativePath: string) => readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');

interface Rule {
  pattern: RegExp;
  reason: string;
}

const collectViolations = (rules: Rule[], scanTargets = serverSources): string[] =>
  scanTargets.flatMap(({ path: filePath, text }) =>
    rules
      .filter(({ pattern }) => pattern.test(text))
      .map(({ reason }) => `${filePath} → ${reason}`),
  );

const RETIRED_SERVER_RULES: Rule[] = [
  {
    pattern: /\binitModelRuntimeFromDB\b/,
    reason: 'P05 replaced it with initModelRuntimeFromDeploymentConfig (deployment-owned only)',
  },
  {
    pattern: /\bresolveQuotaAccountEnv\b|\bselectAccountForAgent\b|\bresolveAccountLoads\b/,
    reason: 'P06 retired quota-driven account routing and env injection',
  },
  {
    pattern:
      /\bbeginServerDefaultOperation\b|\bsettleServerDefaultOperation\b|\bgetServerDefaultHeterogeneousCapability\b/,
    reason: 'P05 retired the server-default relay procedures',
  },
];

describe('retired quota account control surface (P06)', () => {
  const quotaRouter = readRepo('apps/server/src/routers/lambda/agentQuota.ts');

  const RETIRED_PROCEDURES = [
    'createAccount',
    'deleteAccount',
    'updateAccount',
    'bindAccount',
    'unbindAccount',
    'listBindings',
    'switchAccount',
    'resolveAccountLoads',
    'selectAccountForAgent',
  ];

  it.each(RETIRED_PROCEDURES)('does not re-register %s', (procedure) => {
    expect(quotaRouter).not.toMatch(new RegExp(`^\\s*${procedure}:`, 'm'));
  });

  it.each([
    'ingestSnapshot',
    'recordUsage',
    'getWindows',
    'getLatestReadings',
    'listSnapshots',
    'listAccounts',
    'listUsageTurns',
  ])('keeps the observation procedure %s', (procedure) => {
    expect(quotaRouter).toMatch(new RegExp(`^\\s*${procedure}:`, 'm'));
  });
});

describe('retired importer/provider surfaces (P05)', () => {
  it('keeps aiProviders/aiModels out of the import table config', () => {
    const importer = readRepo('packages/database/src/repositories/dataImporter/index.ts');
    expect(importer).not.toMatch(/table: ['"]aiProviders['"]/);
    expect(importer).not.toMatch(/table: ['"]aiModels['"]/);
  });

  it('ships none of the retired direct-model OpenAPI modules', () => {
    for (const p of [
      'packages/openapi/src/routes/chat.route.ts',
      'packages/openapi/src/routes/anthropic.route.ts',
      'packages/openapi/src/routes/openai.route.ts',
      'packages/openapi/src/routes/heterogeneous-relay.route.ts',
      'packages/openapi/src/controllers/chat.controller.ts',
      'packages/openapi/src/services/chat.service.ts',
      'packages/openapi/src/services/heterogeneous-direct.service.ts',
      'packages/openapi/src/middleware/hetero-operation-auth.ts',
      'packages/openapi/src/types/chat.type.ts',
      'packages/openapi/src/helpers/translate.ts',
    ]) {
      expect(
        lstatSync(path.join(REPO_ROOT, p), { throwIfNoEntry: false }),
        `${p} is back`,
      ).toBeUndefined();
    }
  });

  it('does not re-register retired OpenAPI route modules', () => {
    const index = readRepo('packages/openapi/src/routes/index.ts');
    for (const key of ['chat', 'anthropic', 'openai', 'heterogeneous-relay']) {
      expect(index).not.toMatch(new RegExp(`['"]${key}['"]:`, 'm'));
    }
    // Parity: the OpenAPI surface still serves the retained endpoints.
    for (const key of ['agents', 'messages', 'responses', 'topics']) {
      expect(index).toMatch(new RegExp(`['"]${key}['"]:`, 'm'));
    }
  });
});

describe('hetero-operation capability grant surface (P05)', () => {
  it('keeps model:invoke out of the grantable capability union', () => {
    const jwt = readRepo('packages/trpc/src/utils/internalJwt.ts');
    const union = jwt.match(/export type HeteroOperationCapability\s*=([\s\S]*?);/);
    expect(union?.[1]).toBeTruthy();
    expect(union![1]).not.toContain('model:invoke');
    // The compat-read literal is allowed exactly once (pre-existing tokens
    // still verify inside their TTL); a second occurrence means a producer
    // re-registered the retired capability.
    expect(jwt.match(/'model:invoke'/g)).toHaveLength(1);
  });
});

describe('server-wide retirement guards', () => {
  it('has no calls or definitions of retired server surfaces', () => {
    expect(collectViolations(RETIRED_SERVER_RULES)).toEqual([]);
  });
});

describe('parity — retained capability registrations stay', () => {
  const lambdaIndex = readRepo('apps/server/src/routers/lambda/index.ts');

  it.each([
    'acceptance',
    'acceptanceComment',
    'agent',
    'agentNotify',
    'agentQuota',
    'aiAgent',
    'aiChat',
    'connector',
    'goal',
    'task',
    'topic',
    'verify',
  ])('lambdaRouter still registers %s', (key) => {
    expect(lambdaIndex).toMatch(new RegExp(`^\\s*${key}: \\w+Router,`, 'm'));
  });
});

describe('the guards themselves are falsifiable', () => {
  it.each([
    ['quota procedure', 'apps/server/src/routers/lambda/agentQuota.ts', 'createAccount'],
    [
      'importer table',
      'packages/database/src/repositories/dataImporter/index.ts',
      "table: 'aiProviders'",
    ],
    [
      'lambda registration',
      'apps/server/src/routers/lambda/index.ts',
      'acceptance: acceptanceRouter',
    ],
  ])('the %s assertion has something to check', (label, file, probe) => {
    const text = readRepo(file);
    // Parity probes exist; retirement probes do not — inverted per label.
    if (label === 'lambda registration') {
      expect(text).toContain(probe);
    } else {
      expect(text).not.toContain(probe);
    }
  });

  it('collectViolations flags injected retired symbols and passes clean sources', () => {
    const bad = [{ path: 'fake.ts', text: 'await initModelRuntimeFromDB(userId);' }];
    expect(collectViolations(RETIRED_SERVER_RULES, bad)).not.toEqual([]);
    expect(
      collectViolations(RETIRED_SERVER_RULES, [{ path: 'ok.ts', text: 'const x = 1;' }]),
    ).toEqual([]);
  });
});
