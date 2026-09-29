'use client';

import { createContext, useContext } from 'react';

import { lambdaClient, lambdaQuery } from '@/libs/trpc/client';

/**
 * Personal vs workspace creds API binding.
 *
 * The personal page (`/settings/credential`) and the workspace page
 * (`/[workspaceSlug]/settings/credential`) share UI components but talk to
 * different tRPC routers — `creds` (the signed-in user's own rows) versus
 * `workspaceCreds` (the cloud workspace's own credentials plus personal
 * credentials members have shared into it, merged server-side).
 * Credentials live in Orvilo's own database — no Market sign-in is needed.
 *
 * The workspace shell wraps the page in {@link CredsApiProvider} with the
 * workspace bindings. Forms/modals read whichever client/query namespace is
 * active via {@link useCredsApi} and otherwise behave identically.
 */
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

const CredsApiContext = createContext<CredsApi | null>(null);

export const CredsApiProvider = CredsApiContext.Provider;

export const useCredsApi = (): CredsApi => useContext(CredsApiContext) ?? defaultCredsApi;
