/**
 * @vitest-environment node
 *
 * Regression guard for the standalone Acceptance / Verify retirement.
 *
 * The workbench used to host two independent product surfaces — `/acceptance/*`
 * (acceptance list, detail, check detail) and `/verify/*` (run list, report) —
 * neither of which had a task / run / project parent. They are retired, so this
 * test asserts they cannot come back through any of the workbench entry layers
 * (React Router framework config, the legacy SPA route table, and the Next.js
 * rewrite predicate), while the agent-document reader that shares the app stays
 * reachable.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const appDir = path.join(import.meta.dirname, '..');

const readApp = (relativePath: string) => readFileSync(path.join(appDir, relativePath), 'utf8');

describe('workbench retired acceptance/verify surfaces', () => {
  it('does not register acceptance or verify in the framework route config', () => {
    const routes = readApp('app/routes.ts');

    expect(routes).not.toMatch(/route\('acceptance'/);
    expect(routes).not.toMatch(/route\('verify'/);
    expect(routes).not.toContain('acceptanceNamespace');
    expect(routes).not.toContain('verifyNamespace');
  });

  it('does not register acceptance or verify in the SPA route table', () => {
    const router = readFileSync(path.join(appDir, 'src/router.tsx'), 'utf8');

    expect(router).not.toMatch(/path: 'acceptance'/);
    expect(router).not.toMatch(/path: 'verify'/);
    expect(router).not.toContain("'./routes/acceptance/");
    expect(router).not.toContain("'./routes/verify");
  });

  it.each([
    'app/routes/acceptanceDetail.tsx',
    'app/routes/acceptanceDetailCheck.tsx',
    'app/routes/acceptanceIndex.tsx',
    'app/routes/verifyDetail.tsx',
    'app/routes/verifyList.tsx',
    'app/layouts/acceptanceNamespace.tsx',
    'app/layouts/verifyNamespace.tsx',
    'app/components/verifyDetail.client.tsx',
    'src/features/acceptance',
    'src/features/verify',
    'src/routes/acceptance',
    'src/routes/verify',
  ])('no longer ships %s', (relativePath) => {
    expect(existsSync(path.join(appDir, relativePath))).toBe(false);
  });

  // The rewrite predicate itself (`isWorkbenchSpaRoute`) is asserted in
  // `src/libs/next/workbenchRoutes.test.ts`; this file only owns the workbench's
  // own route tables, which is the half that would silently re-register the
  // deleted pages.
  it('keeps the agent document route it shares with the main app', () => {
    expect(readApp('app/routes.ts')).toContain("route('agent/:aid/docs/:docId'");
    expect(existsSync(path.join(appDir, 'app/components/agentDocReader.client.tsx'))).toBe(true);
  });
});
