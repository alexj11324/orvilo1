// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { CredentialItem } from '@/database/schemas';

import { OwnCredsService } from './index';

const {
  modelMethods,
  mockCallTool,
  mockCheckHash,
  mockGetFileAccessUrl,
  mockListConnections,
  mockUploadBase64,
} = vi.hoisted(() => ({
  mockCallTool: vi.fn(async (_tool: string, _params: any) => ({ success: true })),
  mockCheckHash: vi.fn(),
  mockGetFileAccessUrl: vi.fn(async () => 'https://files.example/signed'),
  mockListConnections: vi.fn(async () => ({
    connections: [
      {
        createdAt: '2026-09-28T00:00:00Z',
        id: 7,
        providerEmail: 'octocat@github.test',
        providerId: 'github',
        providerName: 'GitHub',
        providerUsername: 'octocat',
        scopes: ['repo'],
        updatedAt: '2026-09-28T00:00:00Z',
      },
    ],
  })),
  mockUploadBase64: vi.fn(async () => ({ fileId: 'file_1', key: 'k', url: 's3://x' })),
  modelMethods: {
    create: vi.fn(),
    deletePersonal: vi.fn(),
    deletePersonalByKey: vi.fn(),
    deleteWorkspaceOwned: vi.fn(),
    decryptPayload: vi.fn(),
    encryptPayload: vi.fn(async (payload: unknown) => `enc:${JSON.stringify(payload)}`),
    findPersonalById: vi.fn(),
    findPersonalByKey: vi.fn(),
    findPersonalByKeys: vi.fn(),
    findWorkspaceOwnedById: vi.fn(),
    findWorkspaceOwnedByKey: vi.fn(),
    findWorkspaceReadableById: vi.fn(),
    findWorkspaceReadableByKey: vi.fn(),
    findWorkspaceReadableByKeys: vi.fn(),
    listPersonal: vi.fn(async () => []),
    listWorkspace: vi.fn(async () => []),
    publish: vi.fn(),
    share: vi.fn(),
    touchLastUsed: vi.fn(async () => {}),
    unshare: vi.fn(),
    updatePersonal: vi.fn(),
    updateWorkspaceOwned: vi.fn(),
  },
}));

// The `@/database` alias doesn't resolve under this repo's vitest (same for
// every apps/server test touching packages/*), so the model module — and its
// `toOwnCredSummary` — is stubbed here. The real summary mapper is covered by
// `packages/database/src/models/__tests__/credential.test.ts`.
vi.mock('@/database/models/credential', () => ({
  CredentialModel: vi.fn(function () {
    return modelMethods;
  }),
  toOwnCredSummary: (row: CredentialItem) => ({
    createdAt: row.createdAt?.toISOString(),
    description: row.description,
    id: row.id,
    key: row.key,
    lastUsedAt: row.lastUsedAt?.toISOString(),
    maskedPreview: row.maskedPreview,
    metadata: row.metadata,
    name: row.name,
    ownerUserId: row.ownerUserId,
    sharedAt: row.sharedAt?.toISOString(),
    sharedWorkspaceId: row.sharedWorkspaceId,
    type: row.type,
    updatedAt: row.updatedAt?.toISOString(),
    visibility: row.visibility,
    workspaceId: row.workspaceId,
  }),
}));

vi.mock('@/database/models/file', () => ({
  FileModel: vi.fn(function () {
    return { checkHash: mockCheckHash };
  }),
}));

vi.mock('@/server/services/file', () => ({
  FileService: vi.fn(function () {
    return {
      getFileAccessUrl: mockGetFileAccessUrl,
      uploadBase64: mockUploadBase64,
    };
  }),
}));

vi.mock('@/server/services/sandbox', () => ({
  createSandboxService: vi.fn(() => ({ callTool: mockCallTool })),
}));

const fakeMarketService = {
  market: {
    connect: { listConnections: mockListConnections },
    creds: { getSkillCredStatus: vi.fn(async () => []) },
  },
} as any;

const baseRow = (overrides: Partial<CredentialItem> = {}): CredentialItem =>
  ({
    accessedAt: null,
    createdAt: new Date('2026-09-28T00:00:00Z'),
    description: null,
    id: 'cred_1',
    key: 'API_KEY',
    lastUsedAt: null,
    maskedPreview: null,
    metadata: null,
    name: 'API Key',
    ownerUserId: 'user-1',
    payload: 'enc:{}',
    sharedAt: null,
    sharedWorkspaceId: null,
    type: 'kv-env',
    updatedAt: new Date('2026-09-28T00:00:00Z'),
    visibility: 'private',
    workspaceId: null,
    ...overrides,
  }) as CredentialItem;

const personalService = () =>
  new OwnCredsService({
    marketService: fakeMarketService,
    serverDB: {} as any,
    userId: 'user-1',
  });

const workspaceService = () =>
  new OwnCredsService({
    marketService: fakeMarketService,
    serverDB: {} as any,
    userId: 'user-1',
    workspaceId: 'ws-1',
  });

beforeEach(() => {
  vi.clearAllMocks();
  modelMethods.listPersonal.mockResolvedValue([]);
  modelMethods.listWorkspace.mockResolvedValue([]);
});

describe('OwnCredsService reads', () => {
  it('lists personal rows only', async () => {
    modelMethods.listPersonal.mockResolvedValue([baseRow()] as any);
    const { data } = await personalService().listPersonal();
    expect(modelMethods.listPersonal).toHaveBeenCalledOnce();
    expect(data).toHaveLength(1);
    expect(data[0]).not.toHaveProperty('payload');
  });

  it('rejects workspace-scoped reads without a workspace context', async () => {
    await expect(personalService().listWorkspace()).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
  });

  it('decrypts kv values when decrypt is requested', async () => {
    const row = baseRow();
    modelMethods.findPersonalById.mockResolvedValue(row);
    modelMethods.decryptPayload.mockResolvedValue({ values: { API_KEY: 'sk-live-123456789' } });

    const cred = await personalService().getPersonal('cred_1', { decrypt: true });
    expect(cred.plaintext).toEqual({ API_KEY: 'sk-live-123456789' });
  });

  it('returns a presigned url for file creds and metadata for oauth creds', async () => {
    const fileRow = baseRow({ metadata: { fileName: 'ssh.pem' }, type: 'file' });
    modelMethods.findPersonalById.mockResolvedValue(fileRow);
    modelMethods.decryptPayload.mockResolvedValue({
      fileHash: 'hash',
      fileUrl: 'files/u1/ssh.pem',
    });

    const cred = await personalService().getPersonal('cred_1', { decrypt: true });
    expect(cred.plaintext).toEqual({
      fileName: 'ssh.pem',
      fileUrl: 'https://files.example/signed',
    });

    const oauthRow = baseRow({
      metadata: { oauthProvider: 'GitHub', oauthUsername: 'octocat' },
      type: 'oauth',
    });
    modelMethods.findPersonalById.mockResolvedValue(oauthRow);
    modelMethods.decryptPayload.mockResolvedValue({ oauthConnectionId: 7 });

    const oauthCred = await personalService().getPersonal('cred_1', { decrypt: true });
    expect(oauthCred.plaintext).toEqual({
      oauthEmail: '',
      oauthProvider: 'GitHub',
      oauthUsername: 'octocat',
    });
  });
});

describe('OwnCredsService writes', () => {
  it('creates personal kv creds with a masked preview and encrypted payload', async () => {
    modelMethods.create.mockImplementation(async (values) => ({
      ...baseRow(),
      ...values,
      id: 'cred_new',
      payload: 'enc:x',
    }));

    const result = await personalService().createKV({
      key: 'api_key',
      name: 'API Key',
      type: 'kv-env',
      values: { API_KEY: 'sk-super-secret' },
      workspaceScope: false,
    });

    expect(modelMethods.create).toHaveBeenCalledWith(
      expect.objectContaining({
        maskedPreview: 'sk-****cret',
        visibility: 'private',
        workspaceId: undefined,
      }),
    );
    expect(modelMethods.create.mock.calls[0][0].payload).toEqual({
      values: { API_KEY: 'sk-super-secret' },
    });
    expect(modelMethods.create.mock.calls[0][0]).not.toHaveProperty('workspaceScope');
    expect(modelMethods.create.mock.calls[0][0]).not.toHaveProperty('values');
    expect(result.id).toBe('cred_new');
  });

  it('creates workspace creds pinned to the verified workspace', async () => {
    modelMethods.create.mockImplementation(async (values) => ({
      ...baseRow(),
      ...values,
      payload: 'enc:x',
    }));

    await workspaceService().createKV({
      key: 'org_key',
      name: 'Org Key',
      type: 'kv-env',
      values: { K: 'v' },
      workspaceScope: true,
    });

    expect(modelMethods.create).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'public', workspaceId: 'ws-1' }),
    );
  });

  it('resolves the uploaded file via the global hash record', async () => {
    mockCheckHash.mockResolvedValue({
      fileType: 'application/x-pem-file',
      isExist: true,
      size: 128,
      url: 'files/u1/cert.pem',
    });
    modelMethods.create.mockImplementation(async (values) => ({ ...baseRow(), ...values }));

    await personalService().createFile({
      fileHashId: 'a'.repeat(64),
      fileName: 'cert.pem',
      key: 'cert',
      name: 'Cert',
      workspaceScope: false,
    });

    expect(modelMethods.create.mock.calls[0][0].payload).toEqual({
      fileHash: 'a'.repeat(64),
      fileType: 'application/x-pem-file',
      fileUrl: 'files/u1/cert.pem',
    });
  });

  it('rejects createFile when the hash has no stored file', async () => {
    mockCheckHash.mockResolvedValue({ isExist: false });
    await expect(
      personalService().createFile({
        fileHashId: 'missing',
        fileName: 'cert.pem',
        key: 'cert',
        name: 'Cert',
        workspaceScope: false,
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('attaches oauth connection display metadata at create time', async () => {
    modelMethods.create.mockImplementation(async (values) => ({ ...baseRow(), ...values }));

    await personalService().createOAuth({
      key: 'gh',
      name: 'GitHub',
      oauthConnectionId: 7,
      workspaceScope: false,
    });

    expect(modelMethods.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          oauthEmail: 'octocat@github.test',
          oauthProvider: 'GitHub',
          oauthUsername: 'octocat',
        },
        payload: { oauthConnectionId: 7 },
        type: 'oauth',
      }),
    );
  });

  it('updates scope-correctly: personal rows via updatePersonal, org rows via updateWorkspaceOwned', async () => {
    modelMethods.updatePersonal.mockResolvedValue([baseRow()]);
    modelMethods.updateWorkspaceOwned.mockResolvedValue([
      baseRow({ visibility: 'public', workspaceId: 'ws-1' }),
    ]);

    await personalService().update({ id: 'cred_1', name: 'New name', workspaceScope: false });
    expect(modelMethods.updatePersonal).toHaveBeenCalledWith('cred_1', { name: 'New name' });

    await workspaceService().update({ id: 'cred_2', workspaceScope: true });
    expect(modelMethods.updateWorkspaceOwned).toHaveBeenCalledWith('cred_2', 'ws-1', {});
  });

  it('re-encrypts values and refreshes the masked preview on update', async () => {
    modelMethods.updatePersonal.mockResolvedValue([baseRow()]);

    await personalService().update({
      id: 'cred_1',
      values: { API_KEY: 'rotated-secret' },
      workspaceScope: false,
    });

    expect(modelMethods.updatePersonal).toHaveBeenCalledWith(
      'cred_1',
      expect.objectContaining({ maskedPreview: 'rot****cret', payload: expect.any(String) }),
    );
  });

  it('throws NOT_FOUND when update/delete touch nothing', async () => {
    modelMethods.updatePersonal.mockResolvedValue([]);
    modelMethods.deletePersonal.mockResolvedValue([]);
    await expect(
      personalService().update({ id: 'missing', workspaceScope: false }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await expect(personalService().delete('missing', false)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });
});

describe('OwnCredsService share lifecycle', () => {
  it('shares into the verified workspace context only', async () => {
    modelMethods.share.mockResolvedValue(
      baseRow({ sharedWorkspaceId: 'ws-1', visibility: 'public' }),
    );

    await expect(personalService().share('cred_1')).rejects.toMatchObject({
      code: 'BAD_REQUEST',
    });
    expect(modelMethods.share).not.toHaveBeenCalled();

    const shared = await workspaceService().share('cred_1', { visibility: 'private' });
    expect(modelMethods.share).toHaveBeenCalledWith('cred_1', 'ws-1', 'private');
    expect(shared.sharedWorkspaceId).toBe('ws-1');
  });

  it('unshares and publishes through the model', async () => {
    modelMethods.unshare.mockResolvedValue(baseRow());
    modelMethods.publish.mockResolvedValue(baseRow({ visibility: 'public' }));

    await personalService().unshare('cred_1');
    expect(modelMethods.unshare).toHaveBeenCalledWith('cred_1');

    const published = await personalService().publish('cred_1');
    expect(modelMethods.publish).toHaveBeenCalledWith('cred_1');
    expect(published.visibility).toBe('public');
  });
});

describe('OwnCredsService inject', () => {
  it('resolves kv-env creds, writes ~/.creds/env, and masks the response', async () => {
    const row = baseRow({ key: 'api_key' });
    modelMethods.findPersonalByKeys.mockResolvedValue([row]);
    modelMethods.decryptPayload.mockResolvedValue({
      values: { API_KEY: 'sk-live-123456789' },
    });

    const result = await personalService().inject({
      keys: ['api_key'],
      sandbox: true,
      topicId: 'topic-1',
    });

    expect(mockCallTool).toHaveBeenCalledWith('runCommand', {
      command: expect.stringContaining('>> ~/.creds/env && . ~/.creds/env'),
    });
    expect(mockCallTool.mock.calls[0]![1].command).toContain(
      `'export API_KEY='"'"'sk-live-123456789'"'"''`,
    );
    expect(result.credentials?.env).toEqual({ API_KEY: 'sk-****6789' });
    expect(result.notFound).toEqual([]);
    expect(modelMethods.touchLastUsed).toHaveBeenCalledWith(['cred_1']);
  });

  it('reports kv-header + oauth creds as unsupported in a sandbox', async () => {
    modelMethods.findWorkspaceReadableByKeys.mockResolvedValue([
      baseRow({ id: 'cred_h', key: 'hdr', type: 'kv-header' }),
      baseRow({ id: 'cred_o', key: 'oauth', type: 'oauth' }),
    ]);
    modelMethods.decryptPayload.mockImplementation(async (row: CredentialItem) =>
      row.type === 'kv-header' ? { values: { 'X-Auth': 'v' } } : { oauthConnectionId: 1 },
    );

    const result = await workspaceService().inject({
      keys: ['hdr', 'oauth', 'missing'],
      sandbox: true,
      topicId: 'topic-1',
    });

    expect(result.unsupportedInSandbox.sort()).toEqual(['hdr', 'oauth']);
    expect(result.notFound).toEqual(['missing']);
    expect(result.success).toBe(false);
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('skips the sandbox write entirely when sandbox=false', async () => {
    const row = baseRow({ key: 'api_key' });
    modelMethods.findPersonalByKeys.mockResolvedValue([row]);
    modelMethods.decryptPayload.mockResolvedValue({ values: { API_KEY: 'x' } });

    await personalService().inject({ keys: ['api_key'], sandbox: false, topicId: 'topic-1' });
    expect(mockCallTool).not.toHaveBeenCalled();
  });

  it('downloads file creds into the sandbox files dir', async () => {
    modelMethods.findPersonalByKeys.mockResolvedValue([
      baseRow({ key: 'cert', metadata: { fileName: 'cert.pem' }, type: 'file' }),
    ]);
    modelMethods.decryptPayload.mockResolvedValue({ fileHash: 'h', fileUrl: 'u' });

    const result = await personalService().inject({
      keys: ['cert'],
      sandbox: true,
      topicId: 'topic-1',
    });

    expect(mockCallTool).toHaveBeenCalledWith('runCommand', {
      command: expect.stringContaining('curl -fsSL'),
    });
    expect(mockCallTool.mock.calls[0]![1].command).toContain('~/.creds/files/cert.pem');
    expect(result.credentials?.files?.[0]).toMatchObject({
      content: 'https://files.example/signed',
      fileName: 'cert.pem',
      key: 'cert',
    });
  });
});

describe('OwnCredsService skill declarations', () => {
  it('recomputes satisfied/boundCred against own rows', async () => {
    fakeMarketService.market.creds.getSkillCredStatus.mockResolvedValueOnce([
      { key: 'api_key', name: 'API Key', type: 'kv-env' },
      { key: 'missing_key', name: 'Missing', type: 'kv-env' },
    ] as never);
    modelMethods.listPersonal.mockResolvedValue([baseRow({ key: 'api_key' })] as any);

    const statuses = await personalService().getSkillCredStatus('skill-x');
    expect(statuses[0].satisfied).toBe(true);
    expect(statuses[0].boundCred?.key).toBe('api_key');
    expect(statuses[1].satisfied).toBe(false);
  });
});
