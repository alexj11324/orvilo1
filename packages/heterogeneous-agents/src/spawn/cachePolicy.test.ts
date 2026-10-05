import { describe, expect, it } from 'vitest';

import {
  AGENT_CACHE_POLICIES,
  CACHE_KEEPALIVE_ENV,
  CODEX_PROMPT_CACHE_KEY_ENV,
  computeMaxKeepalivePings,
  resolveAgentCachePolicy,
  resolveCacheKeepalive,
} from './cachePolicy';

describe('AGENT_CACHE_POLICIES', () => {
  it('encodes the verified per-engine economics', () => {
    expect(AGENT_CACHE_POLICIES['claude-code']).toMatchObject({
      cacheTtlSeconds: 300,
      maxKeepaliveWindowMs: 3_360_000,
      pingIntervalSeconds: 270,
      supportsKeepalive: true,
    });
    expect(AGENT_CACHE_POLICIES.codex).toMatchObject({
      cacheTtlSeconds: 1800,
      pingIntervalSeconds: 1650,
      supportsKeepalive: true,
    });
    expect(AGENT_CACHE_POLICIES.devin).toMatchObject({
      cacheTtlSeconds: 300,
      pingIntervalSeconds: 270,
      supportsKeepalive: true,
    });
    expect(AGENT_CACHE_POLICIES.devin.verify).toBeTruthy();
  });

  it('marks un-audited adapters as incapable', () => {
    for (const agentType of [
      'amp',
      'codebuddy',
      'cursor',
      'droid',
      'grok-build',
      'kimi-code',
      'opencode',
      'pi',
      'qoder',
      'trae',
    ]) {
      expect(AGENT_CACHE_POLICIES[agentType]?.supportsKeepalive).toBe(false);
    }
  });
});

describe('resolveAgentCachePolicy', () => {
  it('resolves engine kinds onto their CLI family policy', () => {
    expect(resolveAgentCachePolicy('claude-sdk')).toBe(AGENT_CACHE_POLICIES['claude-code']);
    expect(resolveAgentCachePolicy('codex-app-server')).toBe(AGENT_CACHE_POLICIES.codex);
  });

  it('returns undefined for unknown agent types', () => {
    expect(resolveAgentCachePolicy('not-an-agent')).toBeUndefined();
  });
});

describe('computeMaxKeepalivePings', () => {
  it('derives break-even from the policy cost factors, not a hardcoded count', () => {
    expect(computeMaxKeepalivePings(AGENT_CACHE_POLICIES['claude-code'])).toBe(12); // 1.25 / 0.1
    expect(computeMaxKeepalivePings(AGENT_CACHE_POLICIES.codex)).toBe(5); // 1.25 / 0.25
    expect(computeMaxKeepalivePings(AGENT_CACHE_POLICIES.devin)).toBe(12);
  });
});

describe('resolveCacheKeepalive', () => {
  // Repo augmentation marks these env keys required — provide them so plain
  // literals satisfy `NodeJS.ProcessEnv` without reaching for process.env.
  const testEnv = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => ({
    NODE_ENV: 'test',
    NEXT_PUBLIC_DEVELOPER_DEBUG: '',
    NEXT_PUBLIC_I18N_DEBUG: '',
    NEXT_PUBLIC_I18N_DEBUG_BROWSER: '',
    NEXT_PUBLIC_I18N_DEBUG_SERVER: '',
    ...overrides,
  });
  const cleanEnv = testEnv();

  it('enables capable engines by default', () => {
    const resolved = resolveCacheKeepalive('claude-code', cleanEnv);
    expect(resolved).toMatchObject({
      enabled: true,
      maxPings: 12,
      maxWindowMs: 3_360_000,
      pingIntervalMs: 270_000,
    });
  });

  it('returns undefined for incapable and unknown engines', () => {
    expect(resolveCacheKeepalive('kimi-code', cleanEnv)).toBeUndefined();
    expect(resolveCacheKeepalive('not-an-agent', cleanEnv)).toBeUndefined();
  });

  it('honours the global kill switch', () => {
    for (const value of ['0', 'off', 'false', 'no']) {
      expect(
        resolveCacheKeepalive('claude-code', testEnv({ [CACHE_KEEPALIVE_ENV]: value })),
      ).toBeUndefined();
    }
    expect(
      resolveCacheKeepalive('claude-code', testEnv({ [CACHE_KEEPALIVE_ENV]: '1' })),
    ).toBeDefined();
  });

  it('honours the per-engine kill switch and interval/window overrides', () => {
    expect(
      resolveCacheKeepalive('codex', testEnv({ [`${CACHE_KEEPALIVE_ENV}_CODEX`]: '0' })),
    ).toBeUndefined();
    // Per-engine env does not leak across engines.
    expect(
      resolveCacheKeepalive('claude-code', testEnv({ [`${CACHE_KEEPALIVE_ENV}_CODEX`]: '0' })),
    ).toBeDefined();

    const tuned = resolveCacheKeepalive(
      'codex',
      testEnv({
        [`${CACHE_KEEPALIVE_ENV}_CODEX_INTERVAL_MS`]: '60000',
        [`${CACHE_KEEPALIVE_ENV}_CODEX_WINDOW_MS`]: '120000',
      }),
    );
    expect(tuned).toMatchObject({ maxWindowMs: 120_000, pingIntervalMs: 60_000 });
  });

  it('lets explicit overrides win over env', () => {
    const resolved = resolveCacheKeepalive('claude-code', testEnv({ [CACHE_KEEPALIVE_ENV]: '0' }), {
      enabled: true,
      maxPings: 3,
      maxWindowMs: 9_000,
      pingIntervalMs: 40,
    });
    expect(resolved).toMatchObject({
      enabled: true,
      maxPings: 3,
      maxWindowMs: 9_000,
      pingIntervalMs: 40,
    });
    expect(resolveCacheKeepalive('claude-code', cleanEnv, { enabled: false })).toBeUndefined();
  });

  it('offers prompt_cache_key for codex only under the env opt-in', () => {
    expect(resolveCacheKeepalive('codex', cleanEnv)?.promptCacheKey).toBeUndefined();
    expect(
      resolveCacheKeepalive('codex', testEnv({ [CODEX_PROMPT_CACHE_KEY_ENV]: '1' }))
        ?.promptCacheKey,
    ).toBe('prompt_cache_key');
    // Only codex's policy declares the option.
    expect(
      resolveCacheKeepalive('claude-code', testEnv({ [CODEX_PROMPT_CACHE_KEY_ENV]: '1' }))
        ?.promptCacheKey,
    ).toBeUndefined();
  });
});
