// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { mcpEventsRouter } from '../mcpEvents';

const mocks = vi.hoisted(() => ({
  binding: vi.fn(),
  revoke: vi.fn(),
  task: vi.fn(),
  connector: vi.fn(),
  sources: vi.fn(),
  discover: vi.fn(),
  create: vi.fn(),
  stop: vi.fn(),
  list: vi.fn(),
  save: vi.fn(),
  updateTask: vi.fn(),
  readiness: vi.fn(),
}));
vi.mock('@/server/services/mcpEvents/readiness', () => ({
  checkMcpAutomationReadiness: mocks.readiness,
}));
vi.mock('@/server/services/task', () => ({
  TaskService: class {
    updateTaskWithAssigneeLock = mocks.updateTask;
  },
}));
vi.mock('@/database/utils/automationOccurrence', () => ({
  snapshotAutomationDefinition: () => ({ definitionVersionId: 'version' }),
}));
vi.mock('@/database/models/task', () => ({
  TaskModel: class {
    resolve = mocks.task;
    findById = mocks.task;
  },
}));
vi.mock('@/database/models/connector', () => ({
  ConnectorModel: class {
    findPublicById = mocks.connector;
    queryPublic = mocks.sources;
  },
}));
vi.mock('@/server/modules/KeyVaultsEncrypt', () => ({
  KeyVaultsGateKeeper: { initWithEnvKey: async () => ({}) },
}));
vi.mock('@/server/services/mcpEvents/database', () => ({ createMcpEventsSql: () => ({}) }));
vi.mock('@/server/services/mcpEvents/inbox', () => ({
  SqlMcpEventBindingRepository: class {
    get = mocks.binding;
    revoke = mocks.revoke;
  },
}));
vi.mock('@/server/services/mcpEvents/workerRepository', () => ({
  SqlMcpEventTriggerRepository: class {
    list = mocks.list;
    save = mocks.save;
  },
}));
vi.mock('@/server/services/mcpEvents/connector', () => ({
  createConnectorEventsAdapter: () => ({ discover: mocks.discover }),
}));
vi.mock('@/server/services/mcpEvents/subscription', () => ({
  McpEventSubscriptionService: class {
    create = mocks.create;
    stop = mocks.stop;
  },
}));
vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async () => {
  const { trpc } = await vi.importActual<any>('@/libs/trpc/lambda/init');
  return {
    wsCompatProcedure: trpc.procedure,
    requireWorkspaceRoleWhenScoped: () => trpc.middleware(async (opts: any) => opts.next()),
  };
});
vi.mock('@/libs/trpc/lambda/middleware', () => ({
  serverDatabase: async (opts: any) => opts.next(),
}));

const input = {
  taskId: 'task',
  connectorId: 'source',
  eventName: 'changed',
  arguments: {},
  filters: [],
};
const caller = (overrides = {}) =>
  mcpEventsRouter.createCaller({
    serverDB: {},
    userId: 'user',
    workspaceId: 'workspace',
    workspaceRole: 'member',
    ...overrides,
  } as any);
beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateTask.mockResolvedValue({ id: 'task' });
  mocks.readiness.mockResolvedValue({
    canEnable: false,
    reasons: ['WORKER_UNHEALTHY'],
    definitionVersionId: 'version',
    devices: [],
    triggerRevision: 3,
  });
  mocks.task.mockResolvedValue({ id: 'task', createdByUserId: 'user' });
  mocks.connector.mockResolvedValue({ id: 'source', userId: 'user' });
  mocks.list.mockResolvedValue([]);
  mocks.discover.mockResolvedValue({
    supported: true,
    events: [{ name: 'changed', delivery: ['webhook'], inputSchema: {}, payloadSchema: {} }],
  });
  mocks.create.mockResolvedValue({ id: 'binding' });
  mocks.save.mockResolvedValue({ id: 'trigger', enabled: false });
});

describe('MCP Events router authorization decisions (auth transport mocked)', () => {
  it('resolves route identifiers (T-N) to the canonical task id for trigger lookups', async () => {
    mocks.task.mockResolvedValue({ id: 'task_canonical', createdByUserId: 'user' });
    mocks.list.mockResolvedValue([]);
    const result = await caller().list({ taskId: 'T-1' });
    expect(mocks.task).toHaveBeenCalledWith('T-1');
    expect(mocks.list).toHaveBeenCalledWith(expect.anything(), 'task_canonical');
    expect(result.success).toBe(true);
  });
  it('rejects missing task before remote discovery', async () => {
    mocks.task.mockResolvedValue(null);
    await expect(caller().discover(input)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mocks.discover).not.toHaveBeenCalled();
  });
  it.each(['task', 'connector'])(
    'rejects a foreign %s creator before subscription',
    async (entity) => {
      (entity === 'task' ? mocks.task : mocks.connector).mockResolvedValue(
        entity === 'task'
          ? { id: 'task', createdByUserId: 'other' }
          : { id: 'source', userId: 'other' },
      );
      await expect(caller().create(input)).rejects.toMatchObject({ code: 'FORBIDDEN' });
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );
  it('does not invent a personal workspace scope', async () => {
    await expect(caller({ workspaceId: undefined }).create(input)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
    });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('rejects invalid filter paths before remote subscription', async () => {
    await expect(
      caller().create({
        ...input,
        filters: [{ path: ['__proto__'], operator: 'equals', value: 'x' }],
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it('persists a paused trigger bound to the authenticated scope only', async () => {
    await caller().create(input);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'workspace',
        workspaceId: 'workspace',
        userId: 'user',
        taskId: 'task',
        subscriptionId: 'binding',
        enabled: false,
      }),
      undefined,
    );
  });
  it('replaces a revoked trigger with its current revision and preserves identity', async () => {
    mocks.list.mockResolvedValue([
      { id: 'existing', revision: 3, sourceId: 'old', subscriptionId: 'old-binding' },
    ]);
    mocks.binding.mockResolvedValue({ state: 'revoked' });
    await caller().create(input);
    expect(mocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'existing', subscriptionId: 'binding', enabled: false }),
      3,
    );
  });
  it('returns only binding state and never signing keys', async () => {
    mocks.list.mockResolvedValue([
      { id: 'existing', tenantId: 'workspace', sourceId: 'source', subscriptionId: 'binding' },
    ]);
    mocks.binding.mockResolvedValue({ state: 'revoked', signingKeys: [{ secret: 'secret' }] });
    const result = await caller().list({ taskId: 'task' });
    expect(result.data.triggers[0].bindingState).toBe('revoked');
    expect(JSON.stringify(result)).not.toContain('secret');
  });
  it('revokes local ingress when its connector has disappeared', async () => {
    mocks.list.mockResolvedValue([
      { id: 'existing', revision: 3, sourceId: 'source', subscriptionId: 'binding' },
    ]);
    mocks.connector.mockResolvedValue(null);
    const result = await caller().stop({ taskId: 'task' });
    expect(mocks.revoke).toHaveBeenCalledWith(
      { tenantId: 'workspace', connectorId: 'source' },
      'binding',
    );
    expect(result.data).toEqual({ stopped: true, cleanupPending: true });
    expect(mocks.stop).not.toHaveBeenCalled();
  });
  it('reports remote cleanup failure after durable local revocation', async () => {
    mocks.list.mockResolvedValue([
      { id: 'existing', revision: 3, sourceId: 'source', subscriptionId: 'binding' },
    ]);
    mocks.stop.mockRejectedValueOnce(new Error('offline'));
    const result = await caller().stop({ taskId: 'task' });
    expect(mocks.revoke).toHaveBeenCalled();
    expect(result.data).toEqual({ stopped: true, cleanupPending: true });
  });
  it('cleans up subscription on trigger CAS conflict', async () => {
    mocks.save.mockResolvedValue(undefined);
    await expect(caller().create(input)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.stop).toHaveBeenCalledWith(
      { tenantId: 'workspace', connectorId: 'source' },
      'binding',
    );
  });
  it('converts a saved event definition to a paused automation without running it', async () => {
    await caller().create(input);
    expect(mocks.updateTask).toHaveBeenCalledWith(
      'task',
      { automationMode: 'event', status: 'paused' },
      { userId: 'user' },
      expect.anything(),
    );
  });
  it('blocks enable when the observed worker is unhealthy', async () => {
    mocks.list.mockResolvedValue([
      { id: 'existing', revision: 3, sourceId: 'source', subscriptionId: 'binding' },
    ]);
    mocks.connector.mockResolvedValue({
      id: 'source',
      userId: 'user',
      isEnabled: true,
      status: 'connected',
    });
    const result = await caller().enable({
      taskId: 'task',
      triggerRevision: 3,
      definitionVersionId: 'version',
    });
    expect(result.data.enabled).toBe(false);
    expect(result.data.reasons).toEqual(['WORKER_UNHEALTHY']);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('arms the checked revision and persists its one-device binding in a transaction', async () => {
    mocks.list.mockResolvedValue([
      {
        id: 'existing',
        revision: 3,
        sourceId: 'source',
        subscriptionId: 'binding',
        tenantId: 'workspace',
      },
    ]);
    mocks.connector.mockResolvedValue({
      id: 'source',
      userId: 'user',
      isEnabled: true,
      status: 'connected',
    });
    mocks.binding.mockResolvedValue({ state: 'active', revision: 5, expiresAt: null });
    mocks.readiness.mockResolvedValue({
      canEnable: true,
      reasons: [],
      deviceId: 'device',
      definitionVersionId: 'version',
      devices: [{ id: 'device', name: 'Device' }],
      triggerRevision: 3,
    });
    const query = { from: vi.fn(), where: vi.fn(), for: vi.fn().mockResolvedValue([]) };
    query.from.mockReturnValue(query);
    query.where.mockReturnValue(query);
    const db = { select: vi.fn(() => query), transaction: vi.fn() };
    db.transaction.mockImplementation(async (callback: any) => callback(db));
    const result = await caller({ serverDB: db }).enable({
      taskId: 'task',
      triggerRevision: 3,
      definitionVersionId: 'version',
    });
    expect(result.data.enabled).toBe(true);
    expect(db.transaction).toHaveBeenCalledOnce();
    expect(mocks.updateTask).toHaveBeenCalledWith(
      'task',
      expect.objectContaining({
        status: 'scheduled',
        config: expect.objectContaining({
          automationDeviceId: 'device',
          automationEnabledAt: expect.any(String),
        }),
      }),
      { userId: 'user' },
      expect.anything(),
    );
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }), 3);
  });
  it('refuses stale definition or trigger revisions before readiness', async () => {
    mocks.list.mockResolvedValue([
      { id: 'existing', revision: 3, sourceId: 'source', subscriptionId: 'binding' },
    ]);
    await expect(
      caller().enable({ taskId: 'task', triggerRevision: 2, definitionVersionId: 'version' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      caller().enable({ taskId: 'task', triggerRevision: 3, definitionVersionId: 'old-version' }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mocks.readiness).not.toHaveBeenCalled();
  });
  it('pauses new occurrences without revoking the subscription or canceling a run', async () => {
    mocks.list.mockResolvedValue([
      { id: 'existing', revision: 3, enabled: true, sourceId: 'source', subscriptionId: 'binding' },
    ]);
    await caller().pause({ taskId: 'task', triggerRevision: 3 });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }), 3);
    expect(mocks.revoke).not.toHaveBeenCalled();
    expect(mocks.stop).not.toHaveBeenCalled();
    expect(mocks.updateTask).not.toHaveBeenCalled();
  });
  it('redacts remote failure messages', async () => {
    mocks.discover.mockRejectedValue(new Error('Bearer secret-token'));
    await expect(caller().discover(input)).rejects.toThrow('Event discovery is unavailable');
  });
});
