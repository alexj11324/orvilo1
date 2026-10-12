import { isTrpcErrorCode, trpcErrorMessage } from './trpcError';

/**
 * `workspace.create` / `workspace.update` reject a URL another workspace owns
 * with tRPC `CONFLICT` and this stable message. Callers attach it to the URL
 * field instead of a generic failure.
 */
export const WORKSPACE_SLUG_TAKEN = 'WORKSPACE_SLUG_TAKEN';

export const isWorkspaceSlugTakenError = (error: unknown): boolean =>
  isTrpcErrorCode(error, 'CONFLICT') && trpcErrorMessage(error) === WORKSPACE_SLUG_TAKEN;
