import type { OwnCredSummary } from '@orvilo/types';

/**
 * Ownership routing for a row from the workspace-scoped credential list
 * (`workspaceCreds.list`). Extracted from {@link CredsList} as plain,
 * dependency-free functions so the routing decision has direct unit
 * coverage independent of React/tRPC test scaffolding — see
 * `credAccess.test.ts`.
 *
 * With credentials stored in Orvilo's own DB, a workspace row can be:
 * - workspace-owned (`ownerType: 'organization'`, `workspaceId` set);
 * - the SIGNED-IN member's own credential shared/published into the
 *   workspace (`ownerType: 'user'` AND `ownerUserId === myUserId`);
 * - ANOTHER member's shared credential (`ownerType: 'user'` AND
 *   `ownerUserId !== myUserId`) — `ownerType` alone conflates this
 *   with the previous case.
 *
 * The server enforces the same split the client routes on:
 * - org-owned → the workspace API (context-bound + workspace:update:all
 *   RBAC on the server);
 * - my own row → must go through my personal `creds` endpoint instead,
 *   which is scoped to my own rows;
 * - another member's row → no endpoint this UI can act through (a
 *   workspace member can read it but not mutate it), so its actions are
 *   hidden rather than misrouted.
 */
export type CredRowOwnership = Pick<OwnCredSummary, 'ownerUserId' | 'ownerType'>;

export const isOwnCredRow = (cred: CredRowOwnership, myUserId: string | undefined): boolean =>
  cred.ownerType !== 'organization' && !!myUserId && cred.ownerUserId === myUserId;

export const isActionableCredRow = (
  cred: CredRowOwnership,
  myUserId: string | undefined,
): boolean => cred.ownerType === 'organization' || isOwnCredRow(cred, myUserId);

/**
 * Which API binding (`personalApi` vs `contextApi`) a row's mutations should
 * go through. Only meaningful for an {@link isActionableCredRow} row — the
 * caller must gate on that first, since another member's row has no correct
 * binding to return here.
 */
export const credsApiForRow = <T>(
  cred: CredRowOwnership,
  myUserId: string | undefined,
  contextApi: T,
  personalApi: T,
): T => (isOwnCredRow(cred, myUserId) ? personalApi : contextApi);
