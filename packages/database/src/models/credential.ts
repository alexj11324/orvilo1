import type {
  CredentialPayload,
  CredentialVisibility,
  CredType,
  OwnCredSummary,
} from '@orvilo/types';
import { and, desc, eq, inArray, isNull, or } from 'drizzle-orm';

import { KeyVaultsGateKeeper } from '@/server/modules/KeyVaultsEncrypt';

import { type CredentialItem, credentials, type NewCredentialItem, users } from '../schemas';
import type { OrviloDatabase } from '../type';

const toIso = (value: Date | null | undefined) => value?.toISOString();

/**
 * Map a `credentials` row to the API-facing summary. Secret material never
 * leaves this boundary: the encrypted `payload` column is intentionally not
 * part of the returned object.
 */
export const toOwnCredSummary = (
  row: CredentialItem,
  options?: { activeWorkspaceId?: string; ownerDisplayName?: string },
): OwnCredSummary => {
  const metadata = row.metadata ?? {};
  const activeWorkspaceId = options?.activeWorkspaceId;

  return {
    createdAt: row.createdAt.toISOString(),
    description: row.description ?? undefined,
    fileName: metadata.fileName,
    fileSize: metadata.fileSize,
    id: row.id,
    key: row.key,
    lastUsedAt: toIso(row.lastUsedAt),
    maskedPreview: row.maskedPreview ?? undefined,
    name: row.name,
    oauthAvatar: metadata.oauthAvatar,
    oauthProvider: metadata.oauthProvider,
    oauthUsername: metadata.oauthUsername,
    ownerDisplayName: options?.ownerDisplayName,
    ownerType: row.workspaceId ? 'organization' : 'user',
    ownerUserId: row.ownerUserId,
    sharedAt: toIso(row.sharedAt),
    sharedToActiveWorkspace: activeWorkspaceId
      ? row.sharedWorkspaceId === activeWorkspaceId
      : undefined,
    sharedWorkspaceId: row.sharedWorkspaceId ?? undefined,
    type: row.type,
    updatedAt: row.updatedAt.toISOString(),
    visibility: row.visibility,
  };
};

/**
 * Data-access layer for `credentials` — the Orvilo-owned replacement for
 * Market credential storage. All secret material stays inside the encrypted
 * `payload` column; callers decode it through `decryptPayload`.
 *
 * Scope is explicit per method rather than ambient on the instance:
 * - `…Personal…` methods pin `owner_user_id = userId AND workspace_id IS NULL`.
 * - `…Workspace…` methods resolve rows inside one workspace — `Owned` means
 *   `workspace_id = ws` (manage targets); `Readable` additionally admits
 *   member-shared rows (`shared_workspace_id = ws` and published, or the
 *   caller's own draft link).
 */
export class CredentialModel {
  private db: OrviloDatabase;
  private userId: string;
  private gateKeeperPromise: Promise<KeyVaultsGateKeeper> | null = null;

  constructor(db: OrviloDatabase, userId: string) {
    this.db = db;
    this.userId = userId;
  }

  private personalOwnership = () =>
    and(eq(credentials.ownerUserId, this.userId), isNull(credentials.workspaceId));

  private workspaceOwnership = (workspaceId: string) => eq(credentials.workspaceId, workspaceId);

  /**
   * Rows a member may *use* inside a workspace: org-owned rows, plus personal
   * rows shared into it (published ones for any member; the owner's own draft
   * link stays visible to them too, mirroring Market's merged org list).
   */
  private workspaceReadable = (workspaceId: string) =>
    or(
      eq(credentials.workspaceId, workspaceId),
      and(
        eq(credentials.sharedWorkspaceId, workspaceId),
        or(eq(credentials.visibility, 'public'), eq(credentials.ownerUserId, this.userId)),
      ),
    );

  private getGateKeeper = () => {
    if (!this.gateKeeperPromise) {
      this.gateKeeperPromise = KeyVaultsGateKeeper.initWithEnvKey();
    }

    return this.gateKeeperPromise;
  };

  encryptPayload = async (payload: CredentialPayload): Promise<string> => {
    const gateKeeper = await this.getGateKeeper();
    return gateKeeper.encrypt(JSON.stringify(payload));
  };

  /**
   * Decrypt a row's payload. Returns `null` when the ciphertext fails
   * authentication instead of leaking a malformed blob to callers.
   */
  decryptPayload = async (row: CredentialItem): Promise<CredentialPayload | null> => {
    const gateKeeper = await this.getGateKeeper();
    const decrypted = await gateKeeper.decrypt(row.payload);

    if (!decrypted.wasAuthentic) {
      console.error('[credential] failed to decrypt payload', { credentialId: row.id });
      return null;
    }

    try {
      return JSON.parse(decrypted.plaintext) as CredentialPayload;
    } catch (error) {
      console.error('[credential] payload is not valid JSON', { credentialId: row.id, error });
      return null;
    }
  };

  create = async (
    params: Omit<NewCredentialItem, 'id' | 'ownerUserId' | 'payload' | 'type'> & {
      payload: CredentialPayload;
      type: CredType;
      workspaceId?: string;
    },
  ) => {
    const { payload, ...rest } = params;
    const [row] = await this.db
      .insert(credentials)
      .values({
        ...rest,
        ownerUserId: this.userId,
        payload: await this.encryptPayload(payload),
      })
      .returning();
    return row;
  };

  // ===== Personal scope =====

  listPersonal = () =>
    this.db.query.credentials.findMany({
      orderBy: desc(credentials.updatedAt),
      where: this.personalOwnership(),
    });

  findPersonalById = (id: string) =>
    this.db.query.credentials.findFirst({
      where: and(eq(credentials.id, id), this.personalOwnership()),
    });

  findPersonalByKey = (key: string) =>
    this.db.query.credentials.findFirst({
      where: and(eq(credentials.key, key), this.personalOwnership()),
    });

  findPersonalByKeys = (keys: string[]) =>
    keys.length === 0
      ? Promise.resolve<CredentialItem[]>([])
      : this.db.query.credentials.findMany({
          where: and(inArray(credentials.key, keys), this.personalOwnership()),
        });

  updatePersonal = async (id: string, value: Partial<NewCredentialItem>) =>
    this.db
      .update(credentials)
      .set({ ...value, updatedAt: new Date() })
      .where(and(eq(credentials.id, id), this.personalOwnership()))
      .returning();

  deletePersonal = async (id: string) =>
    this.db
      .delete(credentials)
      .where(and(eq(credentials.id, id), this.personalOwnership()))
      .returning({ id: credentials.id });

  deletePersonalByKey = async (key: string) =>
    this.db
      .delete(credentials)
      .where(and(eq(credentials.key, key), this.personalOwnership()))
      .returning({ id: credentials.id });

  // ===== Share-link lifecycle (personal rows only) =====

  private updatePersonalShare = async (
    id: string,
    value: Partial<Pick<CredentialItem, 'sharedWorkspaceId' | 'visibility' | 'sharedAt'>>,
  ) => {
    const [row] = await this.db
      .update(credentials)
      .set({ ...value, updatedAt: new Date() })
      .where(and(eq(credentials.id, id), this.personalOwnership()))
      .returning();
    return row;
  };

  share = (id: string, workspaceId: string, visibility: CredentialVisibility) =>
    this.updatePersonalShare(id, {
      sharedAt: visibility === 'public' ? new Date() : null,
      sharedWorkspaceId: workspaceId,
      visibility,
    });

  unshare = (id: string) =>
    this.updatePersonalShare(id, {
      sharedAt: null,
      sharedWorkspaceId: null,
      visibility: 'private',
    });

  publish = (id: string) =>
    this.updatePersonalShare(id, { sharedAt: new Date(), visibility: 'public' });

  // ===== Workspace scope =====

  /**
   * Merged workspace view: org-owned rows plus member-shared rows readable by
   * this caller, joined with owner display names.
   */
  listWorkspace = async (workspaceId: string) => {
    const rows = await this.db
      .select({
        credential: credentials,
        ownerEmail: users.email,
        ownerFullName: users.fullName,
        ownerUsername: users.username,
      })
      .from(credentials)
      .leftJoin(users, eq(users.id, credentials.ownerUserId))
      .where(this.workspaceReadable(workspaceId))
      .orderBy(desc(credentials.updatedAt));

    return rows.map(({ credential, ownerEmail, ownerFullName, ownerUsername }) => ({
      ...credential,
      ownerDisplayName: ownerFullName || ownerUsername || ownerEmail || undefined,
    }));
  };

  findWorkspaceReadableById = async (id: string, workspaceId: string) =>
    this.db.query.credentials.findFirst({
      where: and(eq(credentials.id, id), this.workspaceReadable(workspaceId)),
    });

  findWorkspaceOwnedById = async (id: string, workspaceId: string) =>
    this.db.query.credentials.findFirst({
      where: and(eq(credentials.id, id), this.workspaceOwnership(workspaceId)),
    });

  findWorkspaceOwnedByKey = async (key: string, workspaceId: string) =>
    this.db.query.credentials.findFirst({
      where: and(eq(credentials.key, key), this.workspaceOwnership(workspaceId)),
    });

  findWorkspaceReadableByKey = async (key: string, workspaceId: string) =>
    this.db.query.credentials.findFirst({
      where: and(eq(credentials.key, key), this.workspaceReadable(workspaceId)),
    });

  /** All credentials usable inside a workspace by key list (runtime inject). */
  findWorkspaceReadableByKeys = async (keys: string[], workspaceId: string) =>
    keys.length === 0
      ? Promise.resolve<CredentialItem[]>([])
      : this.db.query.credentials.findMany({
          where: and(inArray(credentials.key, keys), this.workspaceReadable(workspaceId)),
        });

  updateWorkspaceOwned = async (
    id: string,
    workspaceId: string,
    value: Partial<NewCredentialItem>,
  ) =>
    this.db
      .update(credentials)
      .set({ ...value, updatedAt: new Date() })
      .where(and(eq(credentials.id, id), this.workspaceOwnership(workspaceId)))
      .returning();

  deleteWorkspaceOwned = async (id: string, workspaceId: string) =>
    this.db
      .delete(credentials)
      .where(and(eq(credentials.id, id), this.workspaceOwnership(workspaceId)))
      .returning({ id: credentials.id });

  touchLastUsed = async (ids: string[]) => {
    if (ids.length === 0) return;
    await this.db
      .update(credentials)
      .set({ lastUsedAt: new Date() })
      .where(inArray(credentials.id, ids));
  };
}
