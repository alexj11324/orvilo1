/**
 * Credential types for Orvilo-owned credential storage.
 *
 * Credentials live in Orvilo's own database (the `credentials` table +
 * `CredentialModel`); the Market SDK is only involved for the pieces that
 * stay there by design — the OAuth connect broker, skill cred declarations,
 * and the sandbox runtime `inject` writes into.
 */

// ===== Credential Type =====

export type CredType = 'kv-env' | 'kv-header' | 'oauth' | 'file';

// ===== Skill Credential Status =====

/**
 * One declared credential slot of a skill (`getSkillCredStatus`). The
 * declaration itself comes from the Market skill manifest; `satisfied` /
 * `boundCred` are recomputed against the caller's own-DB credentials.
 */
export interface SkillCredStatus {
  boundCred?: OwnCredSummary;
  description?: string;
  key: string;
  name: string;
  required: boolean;
  satisfied: boolean;
  type: CredType;
}

// ===== Orvilo-owned credential storage =====

/**
 * Share-link visibility for a personal credential: 'private' (default — only
 * the owner can see/use it) or 'public' (visible to `sharedWorkspaceId`
 * members). Mirrors the Market model where one share link can exist at a time.
 */
export type CredentialVisibility = 'private' | 'public';

/**
 * Non-secret display metadata for a stored credential. Anything in here is
 * safe to render in lists without decryption — never put credential material
 * (values, tokens, file bytes) in this column.
 */
export interface CredentialMetadata {
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  oauthAvatar?: string;
  oauthEmail?: string;
  oauthProvider?: string;
  oauthUsername?: string;
  /**
   * Set on credentials the provider-binding plane created for a provider —
   * marks them safe to delete once no binding row references them anymore.
   */
  providerBindingProviderId?: string;
}

/**
 * Type-specific secret payloads, serialized to JSON and encrypted into the
 * `credentials.payload` column via `KeyVaultsGateKeeper`.
 */
export interface CredentialKVPayload {
  values: Record<string, string>;
}

/** File credentials reference an object stored through Orvilo's FileService. */
export interface CredentialFilePayload {
  fileHash: string;
  fileId?: string;
  fileType?: string;
  fileUrl?: string;
}

/**
 * OAuth credentials hold only the Market connection reference — token custody
 * stays with the Market connect broker, which exposes no token API to us.
 */
export interface CredentialOAuthPayload {
  oauthConnectionId: number;
}

export type CredentialPayload =
  CredentialFilePayload | CredentialKVPayload | CredentialOAuthPayload;

/**
 * Summary of a credential stored in Orvilo's own database. Structurally
 * mirrors the Market cred shape it replaced so the client swap stayed small;
 * differences are `id: string` (`cred_…` prefixed), `ownerUserId` (Orvilo
 * user id) replacing `ownerAccountId`, and `sharedWorkspaceId` replacing
 * `organizationAccountId`.
 */
export interface OwnCredSummary {
  createdAt: string;
  description?: string;
  // File type specific
  fileName?: string;
  fileSize?: number;
  id: string;
  key: string;
  lastUsedAt?: string;
  maskedPreview?: string;
  name: string;
  // OAuth type specific
  oauthAvatar?: string;
  oauthProvider?: string;
  oauthUsername?: string;
  /**
   * Name of the credential's owner, joined for workspace-scoped responses
   * ([shared by X] display). Absent for the caller's own rows.
   */
  ownerDisplayName?: string;
  /**
   * 'organization' when the workspace owns this credential directly;
   * 'user' when a member shared their own personal credential in. Only
   * populated in workspace-scoped list/get responses.
   */
  ownerType?: 'organization' | 'user';
  /** Orvilo user id of the credential's owner. */
  ownerUserId: string;
  /**
   * Timestamp when `visibility` last became 'public'. Unset while only
   * draft-linked (`sharedWorkspaceId` set, `visibility` still 'private').
   */
  sharedAt?: string;
  /**
   * Enrichment on personal-scoped list responses only, computed against the
   * active workspace context: whether `sharedWorkspaceId` is the *current*
   * workspace. Absent outside a workspace context.
   */
  sharedToActiveWorkspace?: boolean;
  /**
   * Workspace this personal credential is linked to, present once linked via
   * `share` regardless of `visibility`. `null`/absent = personal-only.
   */
  sharedWorkspaceId?: string;
  type: CredType;
  updatedAt: string;
  visibility?: CredentialVisibility;
}

export interface OwnCredWithPlaintext extends OwnCredSummary {
  /** Decrypted key-value pairs for KV types (oauth/file return metadata only). */
  plaintext?: Record<string, string>;
}
