import { describe, expect, it } from 'vitest';

import { shouldHardNavigateToWorkbench } from './workbenchNavigation';

describe('shouldHardNavigateToWorkbench', () => {
  // The standalone `/verify/:runId` report page used to leave the main SPA on
  // every platform. It is retired; the report reads in the portal panel, so an
  // old link must stay in-router instead of loading a workbench route that no
  // longer exists.
  it.each(['/verify', '/verify/run-1'])(
    'keeps the retired verify routes in-router: %s',
    (pathname) => {
      expect(shouldHardNavigateToWorkbench(pathname)).toBe(false);
    },
  );

  it.each(['/acceptance', '/acceptance/a-1?r=2', '/verify-im', '/settings/profile'])(
    'keeps other main-SPA destinations in-router: %s',
    (pathname) => {
      expect(shouldHardNavigateToWorkbench(pathname)).toBe(false);
    },
  );

  it('keeps the agent document reader on the desktop main router', () => {
    expect(shouldHardNavigateToWorkbench('/agent/agt_1/docs/docs_1')).toBe(false);
  });
});
