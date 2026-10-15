import { lambdaClient, lambdaQuery } from '@/libs/trpc/client';

export interface CredsApi {
  client: typeof lambdaClient.creds;
  query: typeof lambdaQuery.creds;
}

/**
 * The personal `creds` binding, exported so callers that need it
 * regardless of ambient context can use it explicitly — e.g. {@link CredsList}
 * routing a merged workspace-view row back to the personal API when its
 * `ownerType` is `'user'` (the row is a member's own credential, not the
 * workspace's), since only the owner's personal endpoint can write to it.
 */
export const defaultCredsApi: CredsApi = {
  client: lambdaClient.creds,
  query: lambdaQuery.creds,
};
