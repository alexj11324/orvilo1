#!/usr/bin/env bun
/**
 * checkPreviewEnv — fail-fast validation for a Vercel Preview deployment.
 *
 * Runs before preview-smoke / preview-e2e hit a deployment so a missing
 * secret or an unreachable deployment fails in seconds with an actionable
 * message instead of timing out deep inside a test.
 *
 * Usage:
 *   bun scripts/ci/checkPreviewEnv.mts --url https://<preview>.vercel.app
 *   BASE_URL=https://<preview>.vercel.app bun scripts/ci/checkPreviewEnv.mts
 *
 * Runner-side env checked:
 *   BASE_URL (or --url)                 deployment under test
 *   DATABASE_URL                        seeds the e2e test user
 *   VERCEL_AUTOMATION_BYPASS_SECRET     Vercel Deployment Protection bypass
 */

interface CheckResult {
  hint?: string;
  name: string;
  ok: boolean;
}

const parseArgs = () => {
  const args = process.argv.slice(2);
  const urlIndex = args.indexOf('--url');
  return urlIndex >= 0 ? args[urlIndex + 1] : undefined;
};

const results: CheckResult[] = [];
const failures: string[] = [];

const check = (result: CheckResult) => {
  results.push(result);
  if (!result.ok && result.hint) failures.push(result.hint);
};

// ── 1. Runner-side environment ─────────────────────────────────────────────

const baseUrl = (parseArgs() || process.env.BASE_URL || '').replace(/\/$/, '');

check({
  name: 'BASE_URL / --url',
  ok: Boolean(baseUrl),
  hint: 'pass --url <preview-url> or set BASE_URL',
});

for (const key of ['DATABASE_URL', 'VERCEL_AUTOMATION_BYPASS_SECRET'] as const) {
  check({
    name: key,
    ok: Boolean(process.env[key]),
    hint:
      key === 'DATABASE_URL'
        ? 'gh secret set PREVIEW_DATABASE_URL  (e2e seeds the test user directly)'
        : 'Vercel → Settings → Deployment Protection → "Protection Bypass for Automation", then gh secret set VERCEL_AUTOMATION_BYPASS_SECRET',
  });
}

// ── 2. Deployment responds ─────────────────────────────────────────────────

if (baseUrl) {
  const headers: Record<string, string> = {};
  if (process.env.VERCEL_AUTOMATION_BYPASS_SECRET) {
    headers['x-vercel-protection-bypass'] = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  }

  try {
    const res = await fetch(`${baseUrl}/api/version`, {
      headers,
      redirect: 'manual',
      signal: AbortSignal.timeout(15_000),
    });
    const body = await res.text();

    if (res.status === 401 || res.status === 403) {
      check({
        name: 'GET /api/version',
        ok: false,
        hint: `deployment returned ${res.status} — VERCEL_AUTOMATION_BYPASS_SECRET is missing or wrong`,
      });
    } else if (!res.ok) {
      check({
        name: 'GET /api/version',
        ok: false,
        hint: `deployment returned ${res.status}: ${body.slice(0, 200)}`,
      });
    } else {
      let version = '';
      try {
        version = JSON.parse(body).version;
      } catch {
        // body wasn't JSON — likely an HTML error page
      }
      check({
        name: 'GET /api/version',
        ok: Boolean(version),
        hint: version ? undefined : `/api/version returned non-JSON: ${body.slice(0, 200)}`,
      });
      if (version) console.log(`       deployment version: ${version}`);
    }
  } catch (error) {
    check({
      name: 'GET /api/version',
      ok: false,
      hint: `request failed: ${(error as Error).message}`,
    });
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

console.log('\nPreview environment check');
for (const r of results) console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`);

if (failures.length > 0) {
  console.log('\nHow to fix:');
  for (const hint of failures) console.log(`  - ${hint}`);
  process.exit(1);
}

console.log('\nAll checks passed.');
