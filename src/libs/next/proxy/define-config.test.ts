/**
 * @vitest-environment node
 */
import { readFile } from 'node:fs/promises';

import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';

import { defineConfig } from './define-config';

vi.mock('@/auth', () => ({
  auth: { api: { getSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } }) } },
}));

const { middleware } = defineConfig();

const run = async (url: string, userAgent?: string) => {
  const res = await middleware(
    new NextRequest(url, userAgent ? { headers: { 'user-agent': userAgent } } : undefined),
  );
  return res?.headers.get('x-middleware-rewrite');
};

const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1';

describe('defineConfig locale path-traversal hardening', () => {
  it('rewrites a normal locale into /spa-auth/<locale>', async () => {
    const rewrite = await run('http://localhost:3010/signin?hl=ja-JP');
    expect(new URL(rewrite!).pathname).toBe('/spa-auth/ja-JP/signin');
  });

  it('falls back to en-US for a traversal locale (plain)', async () => {
    const rewrite = await run('http://localhost:3010/signin?hl=../../api/dev/x');
    const { pathname } = new URL(rewrite!);
    expect(pathname.startsWith('/spa-auth/')).toBe(true);
    expect(pathname).toBe('/spa-auth/en-US/signin');
  });

  it('falls back to en-US for a traversal locale (percent-encoded)', async () => {
    const rewrite = await run('http://localhost:3010/signin?hl=..%2F..%2Fapi%2Fdev%2Fx');
    const { pathname } = new URL(rewrite!);
    expect(pathname.startsWith('/spa-auth/')).toBe(true);
    expect(pathname).toBe('/spa-auth/en-US/signin');
  });

  it('does not treat workspace slugs beginning with an auth route as auth SPA pages', async () => {
    const rewrite = await run(
      'http://localhost:3010/oauth-preview-e2e-20260716/settings/oauth-apps?hl=en-US',
    );
    expect(new URL(rewrite!).pathname).toMatch(
      /^\/spa\/[^/]+\/oauth-preview-e2e-20260716\/settings\/oauth-apps$/,
    );
  });

  it('passes the Linear OAuth callback through to the Next route handler', async () => {
    const response = await middleware(
      new NextRequest('http://localhost:3010/oauth/linear/callback?code=code&state=state'),
    );

    expect(response?.headers.get('x-middleware-next')).toBe('1');
    expect(response?.headers.get('x-middleware-rewrite')).toBeNull();
  });
});

describe('defineConfig Workbench SPA rewrite', () => {
  it('routes verify through Workbench for every user agent', async () => {
    const mobileVerify = await run(
      'http://localhost:3010/verify/run-1?hl=en-US',
      MOBILE_USER_AGENT,
    );
    const desktopVerify = await run('http://localhost:3010/verify/run-1?hl=en-US');

    expect(new URL(mobileVerify!).pathname).toBe('/spa-workbench/en-US/verify/run-1');
    expect(new URL(desktopVerify!).pathname).toBe('/spa-workbench/en-US/verify/run-1');
  });

  it('keeps acceptance on the main SPA', async () => {
    const mobileAcceptance = await run(
      'http://localhost:3010/acceptance/acceptance-1?hl=en-US',
      MOBILE_USER_AGENT,
    );
    const desktopAcceptance = await run('http://localhost:3010/acceptance/acceptance-1?hl=en-US');

    expect(new URL(mobileAcceptance!).pathname).toMatch(/^\/spa\/[^/]+\/acceptance\/acceptance-1$/);
    expect(new URL(desktopAcceptance!).pathname).toMatch(
      /^\/spa\/[^/]+\/acceptance\/acceptance-1$/,
    );
  });

  it('keeps the agent documents index in the Main Mobile SPA', async () => {
    const detail = await run(
      'http://localhost:3010/agent/agt_1/docs/doc_1?hl=en-US',
      MOBILE_USER_AGENT,
    );
    const index = await run('http://localhost:3010/agent/agt_1/docs?hl=en-US', MOBILE_USER_AGENT);

    expect(new URL(detail!).pathname).toBe('/spa-workbench/en-US/agent/agt_1/docs/doc_1');
    expect(new URL(index!).pathname).toMatch(/^\/spa\/[^/]+\/agent\/agt_1\/docs$/);
  });
});

describe('defineConfig Share SPA rewrite', () => {
  it('routes share pages through the Share SPA for every user agent', async () => {
    const mobileTopic = await run(
      'http://localhost:3010/share/t/topic-1?hl=en-US',
      MOBILE_USER_AGENT,
    );
    const desktopTopic = await run('http://localhost:3010/share/t/topic-1?hl=en-US');
    const desktopPage = await run('http://localhost:3010/share/page/docs_1?hl=en-US');
    const desktopArtifact = await run('http://localhost:3010/share/artifact/42?hl=en-US');

    expect(new URL(mobileTopic!).pathname).toBe('/spa-share/en-US/share/t/topic-1');
    expect(new URL(desktopTopic!).pathname).toBe('/spa-share/en-US/share/t/topic-1');
    expect(new URL(desktopPage!).pathname).toBe('/spa-share/en-US/share/page/docs_1');
    expect(new URL(desktopArtifact!).pathname).toBe('/spa-share/en-US/share/artifact/42');
  });

  it('leaves non-share paths that merely start with the prefix in the main SPA', async () => {
    const rewrite = await run('http://localhost:3010/shared-workspace/settings?hl=en-US');

    expect(new URL(rewrite!).pathname).toMatch(/^\/spa\/[^/]+\/shared-workspace\/settings$/);
  });
});

describe('Acceptance installation guide', () => {
  it('serves the public Markdown asset without authentication or SPA rewrites', async () => {
    const { auth } = await import('@/auth');
    vi.mocked(auth.api.getSession).mockClear();
    const response = await middleware(new NextRequest('http://localhost:3010/acceptance/skill.md'));

    expect(response?.headers.get('x-middleware-next')).toBe('1');
    expect(response?.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response?.headers.get('location')).toBeNull();
    expect(auth.api.getSession).not.toHaveBeenCalled();

    const guide = await readFile('public/acceptance/skill.md', 'utf8');
    expect(guide).toContain('npm install -g @orvilo/cli');
    expect(guide).toContain('lh login');
    expect(guide).toContain('lh acceptance install');
    expect(guide).toContain('.agents/skills/acceptance/SKILL.md');
  });
});

describe('defineConfig backend subtree pass-through', () => {
  // The matcher's workspace-slug lookahead keeps `/market/agent/**` and
  // `/api/agent/**` unmatched today — this locks the middleware-level contract
  // as a safety net: those are Bearer-token APIs (`MarketService`, Hono) whose
  // auth lives in the route handlers, so the middleware must hand them through
  // untouched and an unauthenticated API client must never see a 302 to
  // /signin.
  it('passes /market/agent and /api/agent through without rewrite or session gate', async () => {
    const { auth } = await import('@/auth');
    vi.mocked(auth.api.getSession).mockClear();

    for (const pathname of ['/market/agent', '/market/agent/agent-1', '/api/agent/abc']) {
      const response = await middleware(new NextRequest(`http://localhost:3010${pathname}`));

      expect(response?.headers.get('x-middleware-next'), pathname).toBe('1');
      expect(response?.headers.get('x-middleware-rewrite'), pathname).toBeNull();
      expect(response?.headers.get('location'), pathname).toBeNull();
    }

    expect(auth.api.getSession).not.toHaveBeenCalled();
  });
});
