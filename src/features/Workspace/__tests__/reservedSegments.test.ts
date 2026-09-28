import { describe, expect, it } from 'vitest';

import { createMainAreaChildren, sharedMainAreaChildren } from '@/spa/router/desktopRouter.config';

import { RESERVED_FIRST_SEGMENTS } from '../useWorkspaceUrlSync';
import { WORKSPACE_MIRRORED_FIRST_SEGMENTS } from '../workspaceAwarePath';

/**
 * The comment on `RESERVED_FIRST_SEGMENTS` has always asked for this — "kept in
 * sync with `sharedMainAreaChildren` (paths) … If you add a new root path
 * segment, add it here too" — and nothing enforced it. `/inbox` was added to the
 * router and not to the set, so the URL-as-truth sync treated it as an unresolved
 * *workspace slug*: `workspaces.find(w => w.slug === 'inbox')` misses, the effect
 * returns early, and the store is never switched to personal the way it is for
 * `/tasks`. A prose instruction is not a guard; this is.
 */
/**
 * Walks rather than maps. The first version of this read only the outermost
 * entries, so it missed every segment nested under a path-less wrapper — it
 * reported `agents`/`project`/`automations` and stayed silent about `/inbox`,
 * which is exactly the segment that motivated the guard. A check with a blind
 * spot is worse than no check, because it reads as a pass.
 *
 * A route with a `path` claims its first segment and its children are no longer
 * top level; a route without one is a wrapper, so its children still are.
 */
const staticTopLevelSegments = (routes = createMainAreaChildren()): string[] =>
  routes.flatMap((route) => {
    const { path } = route;
    if (typeof path !== 'string') return staticTopLevelSegments(route.children ?? []);
    if (path === '*' || path.startsWith(':')) return [];
    return [path.split('/')[0]];
  });

describe('RESERVED_FIRST_SEGMENTS', () => {
  it('covers every static top-level path the main area routes', () => {
    const missing = staticTopLevelSegments().filter(
      (segment) => segment && !RESERVED_FIRST_SEGMENTS.has(segment),
    );

    expect(missing).toEqual([]);
  });

  it('reads the router rather than a hand-written list, so it can fail', () => {
    // Guards the guard: if `createMainAreaChildren` ever returns no static
    // segments, the assertion above would pass vacuously.
    expect(staticTopLevelSegments().length).toBeGreaterThan(5);
  });
});

describe('WORKSPACE_MIRRORED_FIRST_SEGMENTS', () => {
  it('covers every static top-level path mirrored under /:workspaceSlug', () => {
    const missing = staticTopLevelSegments(sharedMainAreaChildren).filter(
      (segment) => segment && !WORKSPACE_MIRRORED_FIRST_SEGMENTS.has(segment),
    );

    expect(missing).toEqual([]);
  });
});
