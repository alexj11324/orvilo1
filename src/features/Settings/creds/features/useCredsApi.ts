'use client';

import { createContext, useContext } from 'react';

import { type CredsApi, defaultCredsApi } from '@/services/credentialBindings';

export { type CredsApi, defaultCredsApi } from '@/services/credentialBindings';

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
const CredsApiContext = createContext<CredsApi | null>(null);

export const CredsApiProvider = CredsApiContext.Provider;

export const useCredsApi = (): CredsApi => useContext(CredsApiContext) ?? defaultCredsApi;
