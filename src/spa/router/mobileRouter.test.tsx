import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type { ReactElement } from 'react';
import { matchRoutes } from 'react-router';
import { describe, expect, it } from 'vitest';

import { mobileRoutes } from './mobileRouter.config';

describe('mobileRouter agent share route', () => {
  it('leaves the agent-share visitor surface to the business routes', () => {
    // Agent sharing runs a visitor's conversation on the creator's account, so
    // the surface ships with the deployment that does that accounting and
    // registers itself through `BusinessMobileRoutesWithoutMainLayout`.
    // Nothing claims `/a/*` any more, so it falls through to not-found.
    expect(matchRoutes(mobileRoutes, '/a/my-agent')?.at(-1)?.route.path).toBe('*');
  });

  it('keeps the creator agent surface on /agent/:aid', () => {
    const matches = matchRoutes(mobileRoutes, '/agent/my-agent');

    expect(matches?.some((match) => match.route.path === ':aid')).toBe(true);
    expect(matches?.at(-1)?.params).toMatchObject({ aid: 'my-agent' });
  });

  it('redirects legacy agent topics deep-links to the agent chat route', () => {
    const matches = matchRoutes(mobileRoutes, '/agent/my-agent/topics');

    // Without the literal `topics` redirect, the URL would match `:topicId`
    // and mount chat on a phantom `topics` topic.
    expect(matches?.at(-1)?.route.path).toBe('topics');
    expect(
      (matches?.at(-1)?.route.element as ReactElement<{ to: string }> | undefined)?.props.to,
    ).toBe('..');
  });
});

describe('mobileRouter task routes', () => {
  it('registers task list and detail routes under the shared workspace layout', async () => {
    const source = await readFile(
      path.join(process.cwd(), 'src/spa/router/mobileRouter.config.tsx'),
      'utf8',
    );

    expect(source).toContain("import('@/routes/(main)/(task-workspace)/_layout')");
    expect(source).toContain("import('@/routes/(main)/tasks')");
    expect(source).toContain("import('@/routes/(main)/task/[taskId]')");
    expect(source).toContain("import('@/routes/(main)/agent/task/[taskId]')");
    expect(source).toContain("path: 'tasks'");
    expect(source).toContain("path: 'task'");
    expect(source).toContain("path: 'inbox'");
    expect(source).toContain("path: 'my-work'");
    expect(source).toContain("path: 'views'");
    expect(source).toContain("path: 'teams'");
    // The `:slug?` tail is the readable title segment; it never resolves the
    // task, so pre-slug links keep matching the same route.
    expect(source).toContain("path: ':taskId/:slug?'");
    expect(source).toContain("path: ':aid/task/:taskId/:slug?'");
    expect(source).not.toContain("import('@/routes/(main)/tasks/_layout')");
  });
});

describe('mobileRouter retired provider routes', () => {
  it.each([
    '/settings/provider',
    '/settings/provider/openai',
    '/acme/settings/provider',
    '/acme/settings/provider/openai',
    '/acme/settings/service-model',
  ])('redirects retired provider route %s to the settings root', (pathname) => {
    const matches = matchRoutes(mobileRoutes, pathname);
    const redirect = matches?.find(
      ({ route }) =>
        (route.element as { props?: { to?: string } } | undefined)?.props?.to !== undefined,
    )?.route;

    expect(redirect).toBeDefined();
  });
});

describe('mobile retired product routes', () => {
  it.each(['/community', '/community/agent/example', '/page', '/page/document-id'])(
    'redirects retired route %s home',
    (pathname) => {
      const matches = matchRoutes(mobileRoutes, pathname);
      const redirect = matches?.find(
        ({ route }) =>
          (route.element as { props?: { to?: string } } | undefined)?.props?.to === '..',
      )?.route;

      expect(redirect).toBeDefined();
      expect((redirect?.element as { props: { to: string } }).props.to).toBe('..');
    },
  );

  it.each(['/acme/community/agent/example', '/acme/page/document-id'])(
    'keeps retired route %s inside the active workspace',
    (pathname) => {
      const redirect = matchRoutes(mobileRoutes, pathname)?.find(
        ({ route }) =>
          (route.element as { props?: { to?: string } } | undefined)?.props?.to === '..',
      )?.route;

      expect((redirect?.element as { props: { to: string } }).props.to).toBe('..');
    },
  );
});

// The standalone Acceptance / Verify platform is retired. Its two roots must
// stay reserved words on mobile too: without a route of their own, `/acceptance`
// and `/verify` would be parsed as workspace slugs and `/acceptance/<id>` would
// answer "no such workspace" instead of landing on the task board.
describe('mobileRouter retired acceptance/verify roots', () => {
  it.each([
    '/acceptance',
    '/acceptance/acceptance-1',
    '/acceptance/acceptance-1/check/check-1',
    '/verify',
    '/verify/run-1',
  ])('claims retired root %s with its own route, not the slug segment', (pathname) => {
    const leaf = matchRoutes(mobileRoutes, pathname)?.at(-1)?.route;

    expect(leaf?.path).toMatch(/^(acceptance|verify)\/\*$/);
    expect((leaf?.element as { props?: { to?: string } } | undefined)?.props?.to).toBe('/tasks');
  });
});
