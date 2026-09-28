import { describe, expect, it } from 'vitest';

import { isWorkbenchSpaRoute } from './workbenchRoutes';

describe('isWorkbenchSpaRoute', () => {
  it.each([
    '/agent/agt_9GOn6nUgGw35/docs/TWuw2YunjhwLblZ7',
    '/agent/agt_9GOn6nUgGw35/docs/TWuw2YunjhwLblZ7/',
  ])('matches a Workbench-owned route: %s', (pathname) => {
    expect(isWorkbenchSpaRoute(pathname)).toBe(true);
  });

  it.each([
    '/agent/agt_9GOn6nUgGw35',
    '/agent/agt_9GOn6nUgGw35/docs',
    '/agent/agt_9GOn6nUgGw35/docs/doc-1/history',
    '/workspace/agent/agt_1/docs/docs_1',
  ])('does not broaden ownership beyond the declared route: %s', (pathname) => {
    expect(isWorkbenchSpaRoute(pathname)).toBe(false);
  });

  // The standalone Acceptance / Verify platform is retired, so its URLs are no
  // longer Workbench's to own on any device. `/verify/:runId` used to be here —
  // keeping it would hand the retired surface a live application again.
  it.each([
    '/verify',
    '/verify/',
    '/verify/run-1',
    '/acceptance',
    '/acceptance/acceptance-1',
    '/acceptance/acceptance-1/check/check-1',
    '/acceptance-preview',
    '/acceptance/acceptance-1/history',
    '/workspace/acceptance/acceptance-1',
    '/verify-im',
    '/verify-email',
  ])('no longer claims the retired routes: %s', (pathname) => {
    expect(isWorkbenchSpaRoute(pathname)).toBe(false);
  });
});
