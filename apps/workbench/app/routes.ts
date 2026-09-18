import { index, route, type RouteConfig } from '@react-router/dev/routes';

// The standalone `/acceptance/*` and `/verify/*` trees were retired with the
// standalone Acceptance/Verify platform: those URLs are no longer rewrite
// targets (see `src/libs/next/workbenchRoutes.ts`), so their route modules and
// the two wrappers that only served them are gone. What remains is the agent
// document reader plus the exit redirects.
export default [
  index('routes/homeRedirect.tsx'),
  route('agent/:aid/docs/:docId', 'routes/agentDoc.tsx'),
  route('*', 'routes/catchall.tsx'),
] satisfies RouteConfig;
