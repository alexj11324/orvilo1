import { randomUUID } from 'node:crypto';

import type { OrviloDatabase } from '@orvilo/database';
import type {
  CredentialFilePayload,
  CredentialKVPayload,
  CredentialMetadata,
  CredentialOAuthPayload,
  CredentialVisibility,
  CredType,
  OwnCredSummary,
  OwnCredWithPlaintext,
  SkillCredStatus,
} from '@orvilo/types';
import { TRPCError } from '@trpc/server';
import debug from 'debug';
import { sha256 } from 'js-sha256';

import { CredentialModel, toOwnCredSummary } from '@/database/models/credential';
import { FileModel } from '@/database/models/file';
import type { CredentialItem, NewCredentialItem } from '@/database/schemas';
import { FileService } from '@/server/services/file';
import type { MarketService } from '@/server/services/market';
import { createSandboxService } from '@/server/services/sandbox';

const log = debug('orvilo-server:creds');

/** Directory inside the topic sandbox where file credentials are downloaded. */
const CRED_FILE_SANDBOX_DIR = '~/.creds/files';

const shellQuote = (value: string) => `'${value.replaceAll("'", `'"'"'`)}'`;

/** Display-string masking for `maskedPreview` — never carries real material. */
const maskValue = (value: string) =>
  value.length > 8 ? `${value.slice(0, 3)}****${value.slice(-4)}` : '****';

const computeMaskedPreview = (
  type: CredType,
  payloadValues?: Record<string, string>,
  metadata?: CredentialMetadata,
): string | undefined => {
  if (type === 'kv-env' || type === 'kv-header') {
    const firstValue = payloadValues ? Object.values(payloadValues)[0] : undefined;
    return firstValue ? maskValue(firstValue) : undefined;
  }
  if (type === 'file') return metadata?.fileName;
  if (type === 'oauth')
    return metadata?.oauthUsername ? `@${metadata.oauthUsername}` : metadata?.oauthProvider;
  return undefined;
};

export interface OwnCredsServiceOptions {
  fileService?: FileService;
  marketService?: MarketService;
  serverDB: OrviloDatabase;
  userId: string;
  /**
   * Verified workspace context (`ctx.workspaceId` after cloudWorkspaceAuth).
   * Personal-scope methods ignore it; it selects workspace-vs-personal scope
   * for `list`/`inject` and drives `sharedToActiveWorkspace` enrichment.
   */
  workspaceId?: string;
}

interface ResolvedFileCred {
  fileName: string;
  key: string;
  mimeType: string;
  url: string;
}

/**
 * Credential operations backed by Orvilo's own `credentials` table — the
 * replacement for Market's creds REST API. Two scopes share the service:
 * personal (`workspaceId` undefined → the caller's own rows) and workspace
 * (`list`/`inject` merge org-owned + member-shared rows; manage ops pin
 * `workspace_id` rows only, matching Market's org endpoint which 404s on
 * member-owned shared creds).
 *
 * The Market SDK is still used for exactly two things that stay on Market by
 * design: the OAuth connect broker (`listOAuthConnections` — token custody is
 * Market's) and the topic sandbox runtime that `inject` writes `~/.creds/env`
 * into. OAuth credential *values* therefore cannot be resolved or injected
 * locally — they record the connection id and display metadata only.
 */
export class OwnCredsService {
  private fileModel?: FileModel;
  private fileService?: FileService;
  private marketService?: MarketService;
  private model: CredentialModel;
  private serverDB: OrviloDatabase;
  private userId: string;
  private workspaceId?: string;

  constructor(options: OwnCredsServiceOptions) {
    this.serverDB = options.serverDB;
    this.userId = options.userId;
    this.workspaceId = options.workspaceId;
    this.fileService = options.fileService;
    this.marketService = options.marketService;
    this.model = new CredentialModel(options.serverDB, options.userId);
  }

  private getFileService = () => {
    if (!this.fileService) {
      this.fileService = new FileService(this.serverDB, this.userId, this.workspaceId);
    }
    return this.fileService;
  };

  private getFileModel = () => {
    if (!this.fileModel) {
      this.fileModel = new FileModel(this.serverDB, this.userId, this.workspaceId);
    }
    return this.fileModel;
  };

  private requireMarketService = () => {
    if (!this.marketService) {
      throw new TRPCError({
        code: 'PRECONDITION_FAILED',
        message: 'Market service is required for this operation',
      });
    }
    return this.marketService;
  };

  private requireWorkspaceId = () => {
    if (!this.workspaceId) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'workspaceId is required' });
    }
    return this.workspaceId;
  };

  // ===== Reads =====

  listPersonal = async (): Promise<{ data: OwnCredSummary[] }> => {
    const rows = await this.model.listPersonal();
    return {
      data: rows.map((row) => toOwnCredSummary(row, { activeWorkspaceId: this.workspaceId })),
    };
  };

  listWorkspace = async (): Promise<{ data: OwnCredSummary[] }> => {
    const workspaceId = this.requireWorkspaceId();
    const rows = await this.model.listWorkspace(workspaceId);
    return {
      data: rows.map(({ ownerDisplayName, ...row }) =>
        toOwnCredSummary(row, { activeWorkspaceId: workspaceId, ownerDisplayName }),
      ),
    };
  };

  private summarize = (row: CredentialItemLike, workspaceId?: string, ownerDisplayName?: string) =>
    toOwnCredSummary(row, { activeWorkspaceId: workspaceId, ownerDisplayName });

  private decryptForGet = async (
    row: CredentialItemLike,
    decrypt?: boolean,
  ): Promise<Record<string, string> | undefined> => {
    if (!decrypt) return undefined;
    const payload = await this.model.decryptPayload(row);
    if (!payload) return undefined;

    switch (row.type) {
      case 'kv-env':
      case 'kv-header': {
        return (payload as CredentialKVPayload).values;
      }
      case 'file': {
        const filePayload = payload as CredentialFilePayload;
        const url = await this.getFileService()
          .getFileAccessUrl({ id: filePayload.fileId ?? '', url: filePayload.fileUrl ?? '' })
          .catch(() => undefined);
        return {
          fileName: row.metadata?.fileName ?? '',
          fileUrl: url ?? '',
        };
      }
      // OAuth tokens live in Market's connect broker — there is no token API to
      // decrypt locally, so `get` exposes display metadata only.
      case 'oauth': {
        return {
          oauthEmail: row.metadata?.oauthEmail ?? '',
          oauthProvider: row.metadata?.oauthProvider ?? '',
          oauthUsername: row.metadata?.oauthUsername ?? '',
        };
      }
    }
  };

  private toCredWithPlaintext = async (
    row: CredentialItemLike,
    options?: { decrypt?: boolean; ownerDisplayName?: string },
  ): Promise<OwnCredWithPlaintext> => ({
    ...toOwnCredSummary(row, {
      activeWorkspaceId: this.workspaceId,
      ownerDisplayName: options?.ownerDisplayName,
    }),
    plaintext: await this.decryptForGet(row, options?.decrypt),
  });

  getPersonal = async (id: string, options?: { decrypt?: boolean }) => {
    const row = await this.model.findPersonalById(id);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found' });
    return this.toCredWithPlaintext(row, options);
  };

  getPersonalByKey = async (key: string, options?: { decrypt?: boolean }) => {
    const row = await this.model.findPersonalByKey(key);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found' });
    return this.toCredWithPlaintext(row, options);
  };

  getWorkspace = async (id: string, options?: { decrypt?: boolean }) => {
    const workspaceId = this.requireWorkspaceId();
    const row = await this.model.findWorkspaceOwnedById(id, workspaceId);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found' });
    return this.toCredWithPlaintext(row, options);
  };

  getWorkspaceByKey = async (key: string, options?: { decrypt?: boolean }) => {
    const workspaceId = this.requireWorkspaceId();
    const row = await this.model.findWorkspaceOwnedByKey(key, workspaceId);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found' });
    return this.toCredWithPlaintext(row, options);
  };

  /**
   * Runtime-facing accessors (server builtin runtimes, githubRepo). These
   * resolve by *readable* scope — merged org + shared-in rows in a workspace,
   * the caller's own rows otherwise — rather than the owned-only scope the
   * routers' manage operations use.
   */
  list = async (): Promise<{ data: OwnCredSummary[] }> =>
    this.workspaceId ? this.listWorkspace() : this.listPersonal();

  getByKey = async (key: string, options?: { decrypt?: boolean }) => {
    const row = this.workspaceId
      ? await this.model.findWorkspaceReadableByKey(key, this.workspaceId)
      : await this.model.findPersonalByKey(key);
    if (!row) return null;
    return this.toCredWithPlaintext(row, options);
  };

  /**
   * Resolve plaintext `values` for one key in the caller's current scope —
   * the runtime path (`ServerCredsService.getByKey`,
   * `githubRepo.resolveGithubAccessToken`). Reads member-shared rows too.
   */
  resolveValuesByKey = async (key: string): Promise<Record<string, string> | undefined> => {
    const row = this.workspaceId
      ? await this.model.findWorkspaceReadableByKey(key, this.workspaceId)
      : await this.model.findPersonalByKey(key);
    if (!row) return undefined;
    const payload = await this.model.decryptPayload(row);
    if (!payload || !('values' in payload)) return undefined;
    return payload.values;
  };

  // ===== Writes =====

  private create = async (params: {
    description?: string;
    key: string;
    metadata?: CredentialMetadata;
    name: string;
    payload: CredentialKVPayload | CredentialFilePayload | CredentialOAuthPayload;
    type: CredType;
    workspaceScope: boolean;
    values?: Record<string, string>;
  }) => {
    const workspaceId = params.workspaceScope ? this.requireWorkspaceId() : undefined;
    const { payload, values, workspaceScope, ...rest } = params;
    const row = await this.model.create({
      ...rest,
      maskedPreview: computeMaskedPreview(params.type, values, params.metadata),
      payload,
      visibility: workspaceScope ? 'public' : 'private',
      workspaceId,
    });
    return toOwnCredSummary(row, { activeWorkspaceId: this.workspaceId });
  };

  createKV = async (params: {
    description?: string;
    key: string;
    name: string;
    type: 'kv-env' | 'kv-header';
    values: Record<string, string>;
    workspaceScope: boolean;
  }) => {
    const { workspaceScope, ...rest } = params;
    return this.create({ ...rest, payload: { values: params.values }, workspaceScope });
  };

  createFile = async (params: {
    description?: string;
    fileHashId: string;
    fileName: string;
    key: string;
    name: string;
    workspaceScope: boolean;
  }) => {
    const { workspaceScope, fileHashId, fileName, ...rest } = params;
    // The file was already uploaded via `uploadFile` — resolve the storage
    // reference from the global hash record so the cred stays self-describing.
    const hashInfo = await this.getFileModel().checkHash(fileHashId);
    if (!hashInfo.isExist || !hashInfo.url) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'Credential file not found' });
    }

    return this.create({
      ...rest,
      metadata: { fileName, fileSize: hashInfo.size, fileType: hashInfo.fileType },
      payload: { fileHash: fileHashId, fileType: hashInfo.fileType, fileUrl: hashInfo.url },
      type: 'file',
      workspaceScope,
    });
  };

  createOAuth = async (params: {
    description?: string;
    key: string;
    name: string;
    oauthConnectionId: number;
    workspaceScope: boolean;
  }) => {
    const { workspaceScope, oauthConnectionId, ...rest } = params;

    // Best-effort display metadata from the Market connect broker (provider /
    // username shown in the list). Absent a Market connection it still
    // succeeds — the reference is what matters.
    let metadata: CredentialMetadata | undefined;
    try {
      const { connections } = await this.requireMarketService().market.connect.listConnections();
      const connection = (connections ?? []).find((item: any) => item?.id === oauthConnectionId);
      if (connection) {
        metadata = {
          oauthEmail: connection.providerEmail,
          oauthProvider: connection.providerName ?? connection.providerId,
          oauthUsername: connection.providerUsername,
        };
      }
    } catch (error) {
      log('createOAuth: failed to load connection metadata: %O', error);
    }

    return this.create({
      ...rest,
      metadata,
      payload: { oauthConnectionId },
      type: 'oauth',
      workspaceScope,
    });
  };

  update = async (params: {
    description?: string;
    id: string;
    name?: string;
    values?: Record<string, string>;
    workspaceScope: boolean;
  }) => {
    const { id, values, workspaceScope, ...rest } = params;

    const update: Partial<NewCredentialItem> = { ...rest };
    if (values !== undefined) {
      update.payload = await this.model.encryptPayload({ values });
      update.maskedPreview = computeMaskedPreview('kv-env', values);
    }

    const rows = workspaceScope
      ? await this.model.updateWorkspaceOwned(id, this.requireWorkspaceId(), update)
      : await this.model.updatePersonal(id, update);

    const row = rows[0];
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found' });
    return toOwnCredSummary(row, { activeWorkspaceId: this.workspaceId });
  };

  delete = async (id: string, workspaceScope: boolean) => {
    const rows = workspaceScope
      ? await this.model.deleteWorkspaceOwned(id, this.requireWorkspaceId())
      : await this.model.deletePersonal(id);
    if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found' });
    return { success: true };
  };

  deleteByKey = async (key: string) => {
    const rows = await this.model.deletePersonalByKey(key);
    if (!rows[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found' });
    return { success: true };
  };

  // ===== Share lifecycle =====

  share = async (id: string, options?: { visibility?: CredentialVisibility }) => {
    const workspaceId = this.requireWorkspaceId();
    const visibility = options?.visibility ?? 'public';
    const row = await this.model.share(id, workspaceId, visibility);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found' });
    return toOwnCredSummary(row, { activeWorkspaceId: workspaceId });
  };

  unshare = async (id: string) => {
    const row = await this.model.unshare(id);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found' });
    return toOwnCredSummary(row, { activeWorkspaceId: this.workspaceId });
  };

  publish = async (id: string) => {
    const row = await this.model.publish(id);
    if (!row) throw new TRPCError({ code: 'NOT_FOUND', message: 'Credential not found' });
    return toOwnCredSummary(row, { activeWorkspaceId: this.workspaceId });
  };

  // ===== File upload =====

  uploadFile = async (input: { file: string; fileName: string; fileType: string }) => {
    const base64 = input.file.startsWith('data:')
      ? input.file.slice(input.file.indexOf(',') + 1)
      : input.file;
    const buffer = Buffer.from(base64, 'base64');
    const fileHash = sha256(buffer);

    const extension = input.fileName.split('.').pop();
    const pathname = `credentials/${this.userId}/${randomUUID()}${extension ? `.${extension}` : ''}`;
    await this.getFileService().uploadBase64(input.file, pathname, {
      fileType: input.fileType,
    });

    return {
      fileHashId: fileHash,
      fileName: input.fileName,
      fileSize: buffer.length,
      fileType: input.fileType,
    };
  };

  // ===== OAuth connections (Market connect broker — stays on Market) =====

  listOAuthConnections = async () => this.requireMarketService().market.connect.listConnections();

  // ===== Runtime injection =====

  private resolveFileForInject = async (
    row: CredentialItemLike,
  ): Promise<ResolvedFileCred | null> => {
    const payload = (await this.model.decryptPayload(row)) as CredentialFilePayload | null;
    if (!payload?.fileHash) return null;

    const url = await this.getFileService()
      .getFileAccessUrl({ id: payload.fileId ?? '', url: payload.fileUrl ?? '' })
      .catch(() => undefined);
    if (!url) return null;

    return {
      fileName: row.metadata?.fileName ?? 'credential',
      key: row.key,
      mimeType: payload.fileType ?? row.metadata?.fileType ?? 'application/octet-stream',
      url,
    };
  };

  /**
   * Resolve credentials by key in the caller's current scope and, when
   * `sandbox` is on, write `~/.creds/env` (kv-env values) plus download file
   * credentials inside the topic sandbox. The sandbox runtime stays on
   * Market's infra — only the credential storage moved.
   *
   * OAuth credentials land in `unsupportedInSandbox` unconditionally: their
   * token custody is Market's connect broker and cannot be resolved locally.
   */
  inject = async (input: { keys: string[]; sandbox?: boolean; topicId?: string }) => {
    const sandbox = input.sandbox ?? true;
    const rows = this.workspaceId
      ? await this.model.findWorkspaceReadableByKeys(input.keys, this.workspaceId)
      : await this.model.findPersonalByKeys(input.keys);

    const byKey = new Map(rows.map((row) => [row.key, row]));
    const notFound = input.keys.filter((key) => !byKey.has(key));

    const env: Record<string, string> = {};
    const headers: Record<string, string> = {};
    const files: Array<{ content: string; fileName: string; key: string; mimeType: string }> = [];
    const unsupportedInSandbox: string[] = [];
    const usedIds: string[] = [];

    for (const row of rows) {
      const payload = await this.model.decryptPayload(row);
      if (!payload) continue;
      usedIds.push(row.id);

      switch (row.type) {
        case 'kv-env': {
          Object.assign(env, (payload as CredentialKVPayload).values);
          break;
        }
        case 'kv-header': {
          if (sandbox) {
            unsupportedInSandbox.push(row.key);
          } else {
            Object.assign(headers, (payload as CredentialKVPayload).values);
          }
          break;
        }
        case 'file': {
          const resolved = await this.resolveFileForInject(row);
          if (resolved) {
            files.push({
              content: resolved.url,
              fileName: resolved.fileName,
              key: resolved.key,
              mimeType: resolved.mimeType,
            });
          }
          break;
        }
        // Token custody stays with Market's connect broker.
        case 'oauth': {
          unsupportedInSandbox.push(row.key);
          break;
        }
      }
    }

    if (usedIds.length > 0) await this.model.touchLastUsed(usedIds);

    // The sandbox itself is still Market-hosted infrastructure — only
    // credential storage moved off Market.
    if (sandbox && input.topicId) {
      await this.writeToSandbox({ env, files, topicId: input.topicId });
    }

    // Response values are masked for safe display to the model — matching
    // Market's inject contract — while the sandbox already received the real
    // ones server-side. Callers must never write `credentials.env` into the
    // sandbox a second time (it would shadow the real values with masks).
    const maskedEnv = Object.fromEntries(
      Object.entries(env).map(([key, value]) => [key, maskValue(value)]),
    );
    const maskedHeaders = Object.fromEntries(
      Object.entries(headers).map(([key, value]) => [key, maskValue(value)]),
    );

    return {
      credentials: { env: maskedEnv, files, headers: maskedHeaders },
      notFound,
      success: notFound.length === 0 && unsupportedInSandbox.length === 0,
      unsupportedInSandbox,
    };
  };

  private writeToSandbox = async (params: {
    env: Record<string, string>;
    files: Array<{ content: string; fileName: string; key: string }>;
    topicId: string;
  }) => {
    // Same mechanism Market's creds.inject used: real `export` lines appended
    // to ~/.creds/env inside the session (the command is redacted from logs by
    // CREDS_ENV_WRITE_PATTERN), then sourced so the persistent shell exports
    // them for every later command in the session.
    const envLines = Object.entries(params.env).map(
      ([key, value]) => `export ${key}=${shellQuote(value)}`,
    );
    const fileCommands = params.files.map(
      (file) =>
        `mkdir -p ${CRED_FILE_SANDBOX_DIR} && curl -fsSL ${shellQuote(file.content)} -o ${shellQuote(`${CRED_FILE_SANDBOX_DIR}/${file.fileName}`)}`,
    );
    if (envLines.length === 0 && fileCommands.length === 0) return;

    const command = [
      'mkdir -p ~/.creds',
      envLines.length > 0
        ? `(printf '%s\\n' ${envLines.map(shellQuote).join(' ')}) >> ~/.creds/env && . ~/.creds/env`
        : undefined,
      ...fileCommands,
    ]
      .filter(Boolean)
      .join(' && ');

    const sandboxService = createSandboxService({
      fileService: this.getFileService(),
      marketService: this.requireMarketService(),
      serverDB: this.serverDB,
      topicId: params.topicId,
      userId: this.userId,
    });
    const result = await sandboxService.callTool('runCommand', { command });
    if (!result.success) {
      log('inject: sandbox env write failed: %O', result.error ?? result);
    }
  };

  // ===== Skill credential declarations (Market skill catalog — stays on Market) =====

  /**
   * Skill credential declarations come from the Market skill catalog; the
   * `satisfied`/`boundCred` flags Market computes against its own cred store
   * are recomputed here against our rows.
   */
  getSkillCredStatus = async (skillIdentifier: string): Promise<SkillCredStatus[]> => {
    const declared =
      await this.requireMarketService().market.creds.getSkillCredStatus(skillIdentifier);
    const owned = new Map(
      (this.workspaceId
        ? (await this.model.listWorkspace(this.workspaceId)).map((row) => [row.key, row])
        : (await this.model.listPersonal()).map((row) => [row.key, row])) as Array<
        [string, CredentialItemLike]
      >,
    );

    return (declared ?? []).map((item) => {
      const bound = owned.get(item.key);
      return {
        ...item,
        boundCred: bound
          ? this.summarize(
              bound,
              this.workspaceId,
              (bound as { ownerDisplayName?: string }).ownerDisplayName,
            )
          : undefined,
        satisfied: Boolean(bound),
      } as SkillCredStatus;
    });
  };

  injectForSkill = async (input: {
    sandbox?: boolean;
    skillIdentifier: string;
    topicId?: string;
  }) => {
    const statuses = await this.getSkillCredStatus(input.skillIdentifier);
    const requiredKeys = statuses.map((status) => status.key);
    const result = await this.inject({
      keys: requiredKeys,
      sandbox: input.sandbox,
      topicId: input.topicId,
    });

    return {
      ...result,
      missing: statuses
        .filter((status) => !status.satisfied)
        .map((status) => ({ key: status.key, name: status.name, type: status.type })),
    };
  };
}

/** Row shape the service maps over (`listWorkspace` adds `ownerDisplayName`). */
type CredentialItemLike = CredentialItem;
