// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as LambdaInit from '@/libs/trpc/lambda/init';

import { pluginRouter } from '../plugin';

const { create, query, update, remove } = vi.hoisted(() => ({
  create: vi.fn(async () => ({ identifier: 'old-plugin' })),
  query: vi.fn(async () => [{ identifier: 'old-plugin', type: 'plugin' }]),
  update: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/database/models/plugin', () => ({
  PluginModel: class {
    create = create;
    query = query;
    update = update;
    delete = remove;
    findById = async () => ({ identifier: 'old-plugin', userId: 'user' });
  },
}));
vi.mock('@/libs/trpc/lambda/middleware', async () => {
  const { trpc } = await vi.importActual<typeof LambdaInit>('@/libs/trpc/lambda/init');
  return { serverDatabase: trpc.middleware((opts) => opts.next()) };
});
vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async () => {
  const { trpc } = await vi.importActual<typeof LambdaInit>('@/libs/trpc/lambda/init');
  return { wsCompatProcedure: trpc.procedure };
});
vi.mock('@/business/server/trpc-middlewares/rbacPermission', async () => {
  const { trpc } = await vi.importActual<typeof LambdaInit>('@/libs/trpc/lambda/init');
  return { withScopedPermission: () => trpc.middleware((opts) => opts.next()) };
});

describe('retired platform plugin management', () => {
  beforeEach(() => vi.clearAllMocks());
  const caller = () => pluginRouter.createCaller({ userId: 'user', serverDB: {} } as never);

  it.each(['createPlugin', 'createOrInstallPlugin', 'updatePlugin', 'removePlugin'])(
    'refuses %s before touching stored configuration',
    async (method) => {
      const retired = caller() as unknown as Record<string, (input: unknown) => Promise<unknown>>;
      await expect(
        retired[method]({
          identifier: 'old-plugin',
          id: 'old-plugin',
          type: 'plugin',
          manifest: {},
        }),
      ).rejects.toMatchObject({ code: 'NOT_FOUND' });
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
    },
  );

  it('keeps historical plugin records readable', async () => {
    await expect(caller().getPlugins()).resolves.toEqual([
      { identifier: 'old-plugin', type: 'plugin' },
    ]);
  });
});
