// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { credsRouter } from '@/business/server/lambda-routers/creds';
import { workspaceCredsRouter } from '@/business/server/lambda-routers/workspaceCreds';

const { credsServiceMethods } = vi.hoisted(() => ({
  credsServiceMethods: {
    createFile: vi.fn(async (input: unknown) => ({ id: 'cred_new', ...(input as object) })),
    createKV: vi.fn(async (input: unknown) => ({ id: 'cred_new', ...(input as object) })),
    createOAuth: vi.fn(async () => ({ id: 'cred_oauth' })),
    delete: vi.fn(async () => ({ success: true })),
    deleteByKey: vi.fn(async () => ({ success: true })),
    getPersonal: vi.fn(async () => ({ id: 'cred_1' })),
    getPersonalByKey: vi.fn(async () => ({ id: 'cred_1' })),
    getSkillCredStatus: vi.fn(async () => []),
    getWorkspace: vi.fn(async () => ({ id: 'cred_org' })),
    getWorkspaceByKey: vi.fn(async () => ({ id: 'cred_org' })),
    inject: vi.fn(async () => ({ notFound: [], success: true })),
    injectForSkill: vi.fn(async () => ({ missing: [], success: true })),
    listOAuthConnections: vi.fn(async () => ({ connections: [] })),
    listPersonal: vi.fn(async () => ({ data: [{ id: 'cred_personal', key: 'PERSONAL' }] })),
    listWorkspace: vi.fn(async () => ({
      data: [{ id: 'cred_org', key: 'ORG', ownerType: 'organization' }],
    })),
    publish: vi.fn(async () => ({ id: 'cred_1', visibility: 'public' })),
    share: vi.fn(async () => ({ id: 'cred_1', visibility: 'public' })),
    unshare: vi.fn(async () => ({ id: 'cred_1', visibility: 'private' })),
    update: vi.fn(async () => ({ id: 'cred_1' })),
    uploadFile: vi.fn(async () => ({ fileHashId: 'hash' })),
  },
}));

vi.mock('@/business/server/trpc-middlewares/rbacPermission', () => ({
  withRbacPermission: vi.fn(function () {
    return (opts: any) => opts.next(opts);
  }),
}));

// Simulates the real `cloudWorkspaceAuth`: strips `workspaceId` off the context
// unless the caller is flagged as a workspace member, so `share`/`inject` can
// never target a workspace the caller isn't verified into.
vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async (importOriginal) => {
  const { authedProcedure } = await import('@/libs/trpc/lambda');
  const { TRPCError } = await import('@trpc/server');
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    cloudWorkspaceAuth: vi.fn(function (opts: any) {
      return opts.next({
        ctx: {
          ...opts.ctx,
          workspaceId: opts.ctx.isWorkspaceMember ? opts.ctx.workspaceId : undefined,
        },
      });
    }),
    // wsMemberProcedure replaced with a membership-flag check so the router
    // can be exercised without a DB.
    wsMemberProcedure: authedProcedure.use((opts: any) => {
      if (!opts.ctx.isWorkspaceMember || !opts.ctx.workspaceId) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not a member of this workspace' });
      }
      return opts.next({
        ctx: {
          ...opts.ctx,
          membership: { role: 'member' },
          workspaceRole: 'member',
        },
      });
    }),
  };
});

vi.mock('@/libs/trpc/lambda/middleware', () => ({
  marketUserInfo: vi.fn(function (opts: any) {
    return opts.next({
      ctx: {
        ...opts.ctx,
        marketUserInfo: { email: 'actor@example.com', name: 'Actor', userId: 'user-1' },
      },
    });
  }),
  serverDatabase: vi.fn(function (opts: any) {
    return opts.next({ ctx: { ...opts.ctx, serverDB: opts.ctx.serverDB ?? {} } });
  }),
}));

vi.mock('@/server/services/creds', () => ({
  OwnCredsService: vi.fn(function () {
    return credsServiceMethods;
  }),
}));

vi.mock('@/server/services/market', () => ({
  MarketService: vi.fn(function () {
    return { market: { connect: { listConnections: vi.fn() } } };
  }),
}));

const personalCaller = (ctx: Record<string, unknown>) => credsRouter.createCaller(ctx as any);

const workspaceCaller = (ctx: Record<string, unknown>) =>
  workspaceCredsRouter.createCaller(ctx as any);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('credsRouter (personal scope)', () => {
  it('lists personal creds even inside a verified workspace context', async () => {
    const caller = await personalCaller({
      isWorkspaceMember: true,
      userId: 'user-1',
      workspaceId: 'ws-1',
    });

    const result = await caller.list();
    expect(credsServiceMethods.listPersonal).toHaveBeenCalledOnce();
    expect(credsServiceMethods.listWorkspace).not.toHaveBeenCalled();
    expect(result?.data.map((cred) => cred.id)).toEqual(['cred_personal']);
  });

  it('routes create/update/delete to the personal scope', async () => {
    const caller = await personalCaller({ userId: 'user-1' });

    await caller.createKV({
      key: 'api_key',
      name: 'API Key',
      type: 'kv-env',
      values: { API_KEY: 'x' },
    });
    expect(credsServiceMethods.createKV).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceScope: false }),
    );

    await caller.update({ id: 'cred_1', name: 'renamed' });
    expect(credsServiceMethods.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cred_1', workspaceScope: false }),
    );

    await caller.delete({ id: 'cred_1' });
    expect(credsServiceMethods.delete).toHaveBeenCalledWith('cred_1', false);
  });

  it('passes the verified workspace context into share/visibility changes', async () => {
    const caller = await personalCaller({
      isWorkspaceMember: true,
      userId: 'user-1',
      workspaceId: 'ws-1',
    });

    await caller.share({ id: 'cred_1', visibility: 'private' });
    expect(credsServiceMethods.share).toHaveBeenCalledWith('cred_1', { visibility: 'private' });

    await caller.unshare({ id: 'cred_1' });
    expect(credsServiceMethods.unshare).toHaveBeenCalledWith('cred_1');
    await caller.publish({ id: 'cred_1' });
    expect(credsServiceMethods.publish).toHaveBeenCalledWith('cred_1');
  });

  it('injects creds for the authenticated caller, ignoring any supplied userId', async () => {
    const caller = await personalCaller({ userId: 'user-1' });

    await caller.inject({
      keys: ['api_key'],
      topicId: 'topic-1',
      userId: 'attacker-supplied',
    });

    expect(credsServiceMethods.inject).toHaveBeenCalledWith({
      keys: ['api_key'],
      sandbox: true,
      topicId: 'topic-1',
    });
  });
});

describe('workspaceCredsRouter (workspace scope)', () => {
  it('requires verified workspace membership', async () => {
    const caller = await workspaceCaller({ isWorkspaceMember: false, userId: 'user-1' });
    await expect(caller.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(credsServiceMethods.listWorkspace).not.toHaveBeenCalled();
  });

  it('lists the merged org + shared-in view for members', async () => {
    const caller = await workspaceCaller({
      isWorkspaceMember: true,
      userId: 'user-1',
      workspaceId: 'ws-1',
    });

    const result = await caller.list();
    expect(credsServiceMethods.listWorkspace).toHaveBeenCalledOnce();
    expect(result?.data.map((cred) => cred.id)).toEqual(['cred_org']);
  });

  it('routes create/update/delete to the workspace-owned scope', async () => {
    const caller = await workspaceCaller({
      isWorkspaceMember: true,
      userId: 'user-1',
      workspaceId: 'ws-1',
    });

    await caller.createKV({
      key: 'org_key',
      name: 'Org Key',
      type: 'kv-env',
      values: { K: 'v' },
    });
    expect(credsServiceMethods.createKV).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceScope: true }),
    );

    await caller.update({ id: 'cred_org', name: 'renamed' });
    expect(credsServiceMethods.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cred_org', workspaceScope: true }),
    );

    await caller.delete({ id: 'cred_org' });
    expect(credsServiceMethods.delete).toHaveBeenCalledWith('cred_org', true);
  });

  it('exposes get/getByKey for owned org creds', async () => {
    const caller = await workspaceCaller({
      isWorkspaceMember: true,
      userId: 'user-1',
      workspaceId: 'ws-1',
    });

    await caller.get({ decrypt: true, id: 'cred_org' });
    expect(credsServiceMethods.getWorkspace).toHaveBeenCalledWith('cred_org', {
      decrypt: true,
    });

    await caller.getByKey({ key: 'ORG' });
    expect(credsServiceMethods.getWorkspaceByKey).toHaveBeenCalledWith('ORG', {
      decrypt: undefined,
    });
  });
});
