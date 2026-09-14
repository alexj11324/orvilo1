/**
 * Re-export of workspace ownership helpers from `@orvilo/database`.
 *
 * The actual implementation lives in `packages/database/src/utils/workspace.ts`
 * because Models in that package need the same helpers, and the database
 * package can't import from `src/`. Routers and middleware can import either
 * from this path or from `@orvilo/database` directly.
 */
export { buildWorkspacePayload, buildWorkspaceWhere } from '@orvilo/database';
