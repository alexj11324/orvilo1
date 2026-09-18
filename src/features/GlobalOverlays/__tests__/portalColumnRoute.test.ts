import { describe, expect, it } from 'vitest';

import { portalColumnForPath } from '../portalColumnRoute';

/**
 * The desktop half of the acceptance-drawer fix. `GlobalOverlays` sits outside
 * the per-tab memory routers on Electron, so it cannot use `useMatches` there —
 * it resolves the active tab's pathname against the route table instead. That
 * path is exercised here, and not only in an Electron build, because the logic is
 * a pure function of the pathname.
 */
describe('portalColumnForPath', () => {
  // Every one of these is a child of the single wrapper whose element is
  // `TaskWorkspaceLayout`, so each mounts the portal column.
  it.each(['/tasks', '/inbox', '/task/t-1', '/goal/g-1'])('finds the column on %s', (pathname) => {
    expect(portalColumnForPath(pathname)).toBe(true);
  });

  // The workspace mirror serves the same routes again under a slug. A
  // first-segment check would miss these, which is why matching goes through the
  // route table.
  it.each(['/acme/tasks', '/acme/inbox', '/acme/task/t-1'])(
    'finds the column behind a workspace slug on %s',
    (pathname) => {
      expect(portalColumnForPath(pathname)).toBe(true);
    },
  );

  it.each(['/page', '/settings/memory', '/resource', '/'])(
    'reports no column on %s',
    (pathname) => {
      expect(portalColumnForPath(pathname)).toBe(false);
    },
  );
});
