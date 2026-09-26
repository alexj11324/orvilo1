import { createHash } from 'node:crypto';

import type { DecryptedConnector } from '@/database/models/connector';
import type { InstalledPluginItem } from '@/database/schemas';

/**
 * Canonical JSON with recursively-sorted keys — two runs hashing the same
 * logical payload must produce the same digest regardless of key order.
 */
export const stableStringify = (value: unknown): string => {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
};

export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

/**
 * Digest of one tool api's input schema — the pin an approval receipt binds to,
 * so a schema drift between mount-time authorization and call time refuses the
 * call instead of silently executing against a changed contract.
 */
export const apiSchemaDigest = (parameters: unknown): string =>
  sha256Hex(stableStringify(parameters));

/**
 * The tool surface's schema fingerprint at mount time — one digest per api.
 * The exec callback re-derives the called api's digest and compares, so a
 * connector re-sync that changed `parameters` invalidates mounts/approvals.
 */
export const surfaceSchemaDigests = (
  apis: Array<{ name: string; parameters?: Record<string, unknown> }>,
): Record<string, string> =>
  Object.fromEntries(apis.map((api) => [api.name, apiSchemaDigest(api.parameters)]));

/**
 * Identity/re-authorization pin for a connector row: stable across OAuth token
 * refreshes (which only rewrite `credentials`/`tokenExpiresAt`), but changes
 * when the connection is re-linked or re-authorized — a new Composio connected
 * account, a new OIDC client, a different MCP server URL. Persisted on the
 * mount so exec re-authorizes the SAME grant, never a re-linked row.
 */
export const connectorAuthRevision = (
  connector: DecryptedConnector,
  providerGrant?: { githubUserId: string; grantRevision: string } | null,
): string =>
  sha256Hex(
    stableStringify({
      agentId: connector.agentId ?? null,
      composioAuthConfigId: connector.metadata?.composio?.authConfigId ?? null,
      composioConnectedAccountId: connector.metadata?.composio?.connectedAccountId ?? null,
      // Grant epoch (SA02-C): rotates on re-auth/revoke, stable across token
      // refresh — a same-URL/same-clientId re-authorization to a different
      // account still invalidates old pins.
      grantEpoch: connector.metadata?.grantEpoch ?? null,
      githubGrantRevision: providerGrant?.grantRevision ?? null,
      githubUserId: providerGrant?.githubUserId ?? null,
      mcpConnectionType: connector.mcpConnectionType ?? null,
      mcpServerUrl: connector.mcpServerUrl ?? null,
      oidcClientId: connector.oidcConfig?.clientId ?? null,
      oidcIssuer: connector.oidcConfig?.issuer ?? null,
      userId: connector.userId,
      workspaceId: connector.workspaceId ?? null,
    }),
  );

/**
 * Identity pin for an installed plugin. The install table's PK is composite
 * `(userId, identifier)` — no surrogate id — so the pin is the install
 * generation: `createdAt`/`updatedAt`. A reinstall (delete+insert) or
 * manifest re-sync changes the fingerprint, so exec re-authorizes the SAME
 * mounted install and refuses a re-created same-identifier row.
 */
export const pluginInstallPin = (plugin: InstalledPluginItem): string =>
  sha256Hex(
    stableStringify({
      createdAt: plugin.createdAt?.toISOString() ?? null,
      updatedAt: plugin.updatedAt?.toISOString() ?? null,
    }),
  );

export interface ExternalToolPins {
  /** Composio/OAuth grant fingerprint — see {@link connectorAuthRevision}. */
  authRevision?: string;
  /** Connector row id when `source === 'connector'`. */
  connectorId?: string;
  /** GitHub App user identity bound to this mount. */
  githubUserId?: string;
  /** Exact `github_user_connections.grant_revision` bound to this mount. */
  grantRevision?: string;
  /** Install row id when `source === 'mcp-plugin'`. */
  pluginInstallId?: string;
  /** Per-api `inputSchema` digests at mount time. */
  schemaDigests?: Record<string, string>;
}
