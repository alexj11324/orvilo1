import type { RouteObject } from 'react-router';
import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { sharedMainAreaChildren } from './desktopRouter.shared';
import { mobileRoutes } from './mobileRouter.config';

/**
 * Shared leaves the mobile bundle intentionally does not serve — every entry
 * falls through to the `*` catch-all or is swallowed by `/:workspaceSlug`
 * today. Keep this in step with the mobile router's `mobileExcludedLeafGroups`
 * and the surfaces the mobile bundle does not ship; adding a shared leaf later
 * fails the coverage assertions below until it is mapped on mobile or opted
 * out here.
 */
const MOBILE_UNSUPPORTED_SHARED_PATHS = [
  // Chat management surfaces are desktop-only; the mobile chat layout mounts
  // conversation, settings and nothing else.
  'agent/:aid/docs/:docId',
  'agent/:aid/goal/:goalId',
  'agent/:aid/self-evolving/:domainId',
  'agent/:aid/self-evolving/:domainId/experience',
  'agent/:aid/self-evolving/:domainId/experience/:lessonId',
  'agent/:aid/self-evolving/:domainId/rules',
  'agent/:aid/self-evolving/:domainId/rules/:lessonId',
  'agent/:aid/self-evolving/new',
  'agent/:aid/self-learning/*',
  // The automations console is desktop-only.
  'automations',
  'automations/:taskId',
  'automations/new',
  'automations/runs',
  // Task drafts and goal detail have no mobile pages (see
  // `mobileExcludedLeafGroups` in the mobile router).
  'drafts',
  'goal/:goalId',
  // The group-chat surface is desktop-only.
  'group',
  'group/:gid',
  'group/:gid/:topicId',
  'group/:gid/permission',
  'group/:gid/profile',
  // Mobile `/memory` only carries the retired-root guard, not the preferences
  // page the desktop mounts underneath it.
  'memory/preferences',
  // The project workspace is desktop-only.
  'project/:projectId',
  'project/:projectId/activity',
  'project/:projectId/conversation/:topicId?',
  'project/:projectId/goals',
  'project/:projectId/library/:id',
  'project/:projectId/milestones',
  'project/:projectId/overview',
  'project/:projectId/resources',
  'project/:projectId/tasks',
  'projects',
  // The resource library is desktop-only.
  'resource',
  'resource/:category',
  'resource/all',
  'resource/audios',
  'resource/documents',
  'resource/files',
  'resource/images',
  'resource/library/:id',
  'resource/library/:id/:slug',
  'resource/library/:id/permission',
  'resource/videos',
];

/**
 * Shared leaves that DO match a mobile route — but only because the mobile
 * chat's `:topicId` param swallows them (`/agent/x/docs` opens the chat with a
 * phantom topic). Mobile has no dedicated page for these, so they are pinned
 * to the `:topicId` leaf: a real mobile route added later trips the assertion
 * and forces a conscious decision instead of passing silently.
 */
const MOBILE_PARAM_SHADOWED_PATHS = [
  'agent/:aid/docs',
  'agent/:aid/goals',
  'agent/:aid/permission',
  'agent/:aid/profile',
  'agent/:aid/self-evolving',
  'agent/:aid/share',
  'agent/:aid/statistics',
  'agent/:aid/stats',
  'agent/:aid/tasks',
];

/** `/docs` → `/docs`, `:topicId` → `x1`, `:slug?` → `x1`, `*` → `rest`. */
const concreteUrl = (composedPath: string) =>
  `/${composedPath
    .replaceAll(/:[A-Z]+\??/gi, 'x1')
    .replaceAll('*', 'rest')
    .replaceAll(/\/+/g, '/')}`;

/** Every terminal composed path in the shared definition, e.g. `views/:viewId`. */
const collectLeafPaths = (routes: RouteObject[], base: string, out: string[]) => {
  for (const route of routes) {
    const composed = route.index ? base : route.path ? `${base}/${route.path}` : base;
    if (route.children?.length) {
      collectLeafPaths(route.children, composed, out);
    } else if (route.index || route.path) {
      out.push(composed);
    }
  }
};

const sharedLeafPaths = (() => {
  const paths: string[] = [];
  collectLeafPaths(sharedMainAreaChildren, '', paths);
  return paths.map((path) => path.replace(/^\//, ''));
})();

/**
 * Mobile serves a URL when it resolves to a real leaf — not the root `*`
 * catch-all (which bounces to `/`). For a root-level URL the shared literal
 * must also not be swallowed by `/:workspaceSlug` (`/drafts` answering
 * "workspace drafts" instead of a page or an honest miss); under a workspace
 * the `:workspaceSlug` segment is of course expected.
 */
const mobileServes = (url: string, underWorkspace = false) => {
  const matches = matchRoutes(mobileRoutes, url);
  if (!matches) return false;
  if (matches.at(-1)?.route.path === '*') return false;
  return underWorkspace || !matches.some((match) => match.route.path === ':workspaceSlug');
};

describe('mobileRouter shared-leaf coverage', () => {
  const unsupported = new Set(MOBILE_UNSUPPORTED_SHARED_PATHS);
  const shadowed = new Set(MOBILE_PARAM_SHADOWED_PATHS);
  const supportedPaths = sharedLeafPaths.filter(
    (path) => !unsupported.has(path) && !shadowed.has(path),
  );

  it('lists only real shared leaves in the exclusion allow-lists', () => {
    const shared = new Set(sharedLeafPaths);
    const stale = [...unsupported, ...shadowed].filter((path) => !shared.has(path));

    expect(stale).toEqual([]);
  });

  it.each(supportedPaths)('serves shared leaf /%s at the root and under a workspace', (path) => {
    expect(mobileServes(concreteUrl(path)), concreteUrl(path)).toBe(true);
    expect(mobileServes(`/acme${concreteUrl(path)}`, true), `/acme${concreteUrl(path)}`).toBe(true);
  });

  it.each([...unsupported])(
    'does not serve excluded shared leaf /%s at the root or under a workspace',
    (path) => {
      expect(mobileServes(concreteUrl(path)), concreteUrl(path)).toBe(false);
      expect(mobileServes(`/acme${concreteUrl(path)}`, true), `/acme${concreteUrl(path)}`).toBe(
        false,
      );
    },
  );

  it.each([...shadowed])(
    'claims shared leaf /%s only through the mobile chat :topicId param',
    (path) => {
      expect(matchRoutes(mobileRoutes, concreteUrl(path))?.at(-1)?.route.path).toBe(':topicId');
    },
  );

  it('has an exclusion entry for every shared leaf mobile cannot serve', () => {
    const actualUnsupported = sharedLeafPaths
      .filter((path) => !mobileServes(concreteUrl(path)))
      .sort();

    expect(actualUnsupported).toEqual([...unsupported].sort());
  });
});
