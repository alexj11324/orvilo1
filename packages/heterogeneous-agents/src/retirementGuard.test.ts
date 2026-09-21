import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Anti-resurrection gate for the P04/P05/P06 retirements inside this package,
 * plus the first-party brand invariant. These are structural assertions over
 * production sources (not imports): a later rebase or cherry-pick that quietly
 * reintroduces a retired surface fails here, not at runtime.
 *
 * Parity companion: `registry.test.ts` pins the live/decoder split; the
 * consumer-side keeps live in `src/retirementParity.test.ts`.
 */

const SRC = __dirname;

const collectSources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSources(filePath);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [filePath] : [];
  });

const sourceFiles = collectSources(SRC);
const sources = sourceFiles.map((filePath) => ({
  path: path.relative(SRC, filePath),
  text: readFileSync(filePath, 'utf8'),
}));

interface Rule {
  pattern: RegExp;
  /** Human-facing why, surfaced on violation. */
  reason: string;
}

const collectViolations = (
  rules: { name: string; rules: Rule[] }[],
  scanTargets = sources,
): string[] =>
  rules.flatMap(({ name, rules: patterns }) =>
    scanTargets.flatMap(({ path: filePath, text }) =>
      patterns
        .filter(({ pattern }) => pattern.test(text))
        .map(({ reason }) => `${filePath} → ${name}: ${reason}`),
    ),
  );

const RETIRED_SURFACE_RULES: Rule[] = [
  {
    pattern: /\bproviderBinding\b/,
    reason:
      'P05 retired BYOK provider binding (host/port/drivers/module) — nothing re-registers it',
  },
  {
    pattern: /\bclaudeCodeDirectEnv\b|HETEROGENEOUS_PROVIDER_BINDING_/,
    reason: 'P05 retired the binding-specific env sanitizer',
  },
  {
    pattern: /\bserverDefaultHeterogeneous|SERVER_DEFAULT_HETEROGENEOUS/,
    reason: 'P05 retired the server-default relay surface',
  },
  {
    pattern: /\bHeterogeneousApiConfig\b|\bHeterogeneousAuthMode\b/,
    reason: 'P05 retired BYOK auth-mode types; persisted legacy fields are ignored, not typed',
  },
  {
    pattern: /\bresolveQuotaAccountEnv\b|\bselectAccountForAgent\b|\bquotaAccountPlan\b/,
    reason: 'P06 retired quota-driven credential injection and account routing',
  },
];

const BRAND_RULES: Rule[] = [
  {
    // Quoted product identity — `@lobehub/` package specifiers stay legal (they
    // name an upstream dependency, not our harness identity).
    pattern: /['"`]lobehub|\bLobeHub\b/,
    reason: 'P03 unified first-party identity as Orvilo; lobehub/LobeHub literals are wire-visible',
  },
];

const ENGINE_LOOP_RULES: Rule[] = [
  {
    pattern: /from ['"]@orvilo\/agent-runtime['"]/,
    reason: 'the retired in-process engine package is not a dependency of the ACP host',
  },
  ...[
    'AgentInstruction',
    'ContextBuilder',
    'InstructionExecutor',
    'LLMTransport',
    'RuntimeTransports',
  ].map((symbol) => ({
    pattern: new RegExp(`\\b${symbol}\\b`),
    reason: `${symbol} belongs to the retired in-process engine loop`,
  })),
];

describe('retirement guards (heterogeneous-agents)', () => {
  it('keeps retired provider/quota surfaces out of production sources', () => {
    expect(
      collectViolations([{ name: 'P05/P06 retirements', rules: RETIRED_SURFACE_RULES }]),
    ).toEqual([]);
  });

  it('keeps first-party identity Orvilo on every production file', () => {
    expect(collectViolations([{ name: 'P03 brand', rules: BRAND_RULES }])).toEqual([]);
  });

  it('does not import or re-export the retired engine loop', () => {
    expect(collectViolations([{ name: 'engine loop', rules: ENGINE_LOOP_RULES }])).toEqual([]);
  });

  describe('the guards themselves are falsifiable', () => {
    it.each([
      [[{ name: 'binding', rules: RETIRED_SURFACE_RULES }], "import x from './providerBinding'"],
      [[{ name: 'brand', rules: BRAND_RULES }], "const clientInfo = { name: 'lobehub' }"],
      [
        [{ name: 'engine', rules: ENGINE_LOOP_RULES }],
        "import { InstructionExecutor } from '@orvilo/agent-runtime'",
      ],
    ])('flags injected violations and stays green on clean sources', (groups, badText) => {
      const bad = [{ path: 'fake.ts', text: badText }];
      const clean = [{ path: 'ok.ts', text: 'export const x = 1;' }];
      expect(collectViolations(groups as { name: string; rules: Rule[] }[], bad)).not.toEqual([]);
      expect(collectViolations(groups as { name: string; rules: Rule[] }[], clean)).toEqual([]);
    });
  });
});
