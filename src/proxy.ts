import { defineConfig } from '@/libs/next/proxy/define-config';

const { middleware } = defineConfig();

// required to be literal
export const config = {
  matcher: [
    // NOTE: `/api`, `/trpc`, `/webapi` are intentionally NOT matched. The
    // middleware is a no-op for them — `defaultMiddleware` short-circuits the
    // rewrite half via `backendApiEndpoints`, and they're all public routes, so
    // the better-auth session lookup is skipped. Auth lives in the route
    // handlers (`checkAuth`, trpc `protectedProcedure`), which return JSON 401s
    // rather than the HTML redirect-to-signin. Skipping the matcher avoids a
    // needless middleware invocation on the hottest backend traffic. (/oidc and
    // /oauth stay matched below — their middleware pass is still load-bearing.)
    // include the /
    '/',
    '/acceptance',
    '/acceptance(.*)',
    '/apps',
    '/apps(.*)',
    '/community',
    '/community(.*)',
    '/labs',
    '/eval',
    '/eval(.*)',
    /** Shared-agent pages need the same SPA rewrite as the other client routes. */
    '/a',
    '/a/(.*)',
    '/agent',
    '/agent(.*)',
    // `/agents` and `/memory` were previously reachable only because the
    // `/agent(.*)` and `/me(.*)` prefix wildcards happened to overlap them;
    // the explicit entries make that coverage intentional.
    '/agents',
    '/agents(.*)',
    '/automations',
    '/automations(.*)',
    '/group',
    '/group(.*)',
    '/changelog(.*)',
    '/settings(.*)',
    '/image',
    '/video',
    '/inbox',
    '/inbox(.*)',
    '/invite',
    '/invite(.*)',
    '/memory',
    '/memory(.*)',
    '/resource',
    '/resource(.*)',
    '/profile(.*)',
    '/page',
    '/page(.*)',
    '/project',
    '/project(.*)',
    '/projects',
    '/projects(.*)',
    '/tasks',
    '/tasks(.*)',
    '/task',
    '/task(.*)',
    '/goals',
    '/goals(.*)',
    '/goal',
    '/goal(.*)',
    '/me',
    '/me(.*)',
    '/share(.*)',

    '/onboarding',
    '/onboarding(.*)',

    '/signup(.*)',
    '/signin(.*)',
    '/verify-email(.*)',
    '/verify-im(.*)',
    '/verify',
    '/verify/(.*)',
    '/reset-password(.*)',
    '/auth-error(.*)',
    '/oauth(.*)',
    '/oidc(.*)',
    '/market-auth-callback(.*)',

    // Workspace-scoped SPA mirrors — `/{workspaceSlug}/<segment>` for every
    // segment the router mounts under `/:workspaceSlug` (the shared main-area
    // children plus the workspace-only `settings` and `billing` trees).
    // Segments must be enumerated explicitly: a bare `/:workspaceSlug` entry
    // would also swallow single-segment files like `/manifest.json`, because
    // Next appends an optional transport suffix `(\.json|\.rsc|…)?` to every
    // matcher — `manifest` + `.json` would parse as slug + suffix. Workspace
    // home `/{slug}` itself therefore stays unmatched on direct load — a known
    // limitation. Backend subtrees stay safe even where a second segment does
    // equal one of these literals (`/api/agent`, `/market/agent`): the
    // middleware short-circuits them via `backendApiEndpoints`.
    '/:workspaceSlug/agent(.*)',
    '/:workspaceSlug/agents(.*)',
    '/:workspaceSlug/automations(.*)',
    '/:workspaceSlug/billing(.*)',
    '/:workspaceSlug/community(.*)',
    '/:workspaceSlug/eval(.*)',
    '/:workspaceSlug/goal(.*)',
    '/:workspaceSlug/group(.*)',
    '/:workspaceSlug/image(.*)',
    '/:workspaceSlug/inbox(.*)',
    '/:workspaceSlug/memory(.*)',
    '/:workspaceSlug/page(.*)',
    '/:workspaceSlug/project(.*)',
    '/:workspaceSlug/projects(.*)',
    '/:workspaceSlug/resource(.*)',
    '/:workspaceSlug/settings(.*)',
    '/:workspaceSlug/task(.*)',
    '/:workspaceSlug/tasks(.*)',
    '/:workspaceSlug/video(.*)',
  ],
};

export default middleware;
