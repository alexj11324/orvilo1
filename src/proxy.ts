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
    //
    // Three constraints shape every entry below:
    //
    // 1. Segments are enumerated explicitly. A bare `/:workspaceSlug` entry
    //    would also swallow single-segment files like `/manifest.json`,
    //    because Next appends an optional transport suffix `(\.json|\.rsc|…)?`
    //    to every matcher — `manifest` + `.json` would parse as slug + suffix.
    //    Workspace home `/{slug}` itself therefore stays unmatched on direct
    //    load — a known limitation.
    // 2. The slug carries a negative lookahead (the same exclusion idiom Next
    //    documents for matchers) so first segments that can never be a
    //    workspace don't get intercepted: backend namespaces (`/api/agent` is
    //    a real Hono route, `/market/agent` is the Bearer-token Market API —
    //    matching them would invoke the middleware on hot API traffic),
    //    framework internals (`/_next/image` is the image optimizer), SPA
    //    rewrite targets (`/spa*`), and `public/` asset dirs.
    // 3. The `(/.*)?` tail only accepts a `/`-separated suffix, so it can't
    //    attach mid-segment — `/avatars/agent-default.png` and
    //    `/app-images/agent_gateway_light.webp` are files, not workspace URLs.
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/agent(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/agents(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/automations(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/billing(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/community(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/eval(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/goal(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/group(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/image(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/inbox(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/memory(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/page(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/project(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/projects(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/resource(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/settings(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/task(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/tasks(/.*)?',
    '/:workspaceSlug((?!(?:_next|_deprecated|api|trpc|webapi|oidc|oauth|market|f|middleware|spa|spa-auth|spa-share|spa-workbench|acceptance|app-icons|app-images|avatars|images|og|screenshots|videos|\\.well-known)/)[^/]+)/video(/.*)?',
  ],
};

export default middleware;
