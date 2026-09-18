// @vitest-environment node
import { getTableName, Param, SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { workspaceAgentRouter } from '@/business/server/lambda-routers/workspaceAgent';

const { getDisplayInfoByIds } = vi.hoisted(() => ({
  getDisplayInfoByIds: vi.fn(async () => []),
}));

vi.mock('@/business/server/trpc-middlewares/workspaceAuth', async () => {
  const { authedProcedure } = await import('@/libs/trpc/lambda');
  return { wsCompatProcedure: authedProcedure };
});

vi.mock('@/libs/trpc/lambda/middleware', () => ({
  serverDatabase: vi.fn(function (opts: any) {
    return opts.next({ ctx: opts.ctx });
  }),
}));

vi.mock('@/database/models/user', () => ({
  UserModel: { getDisplayInfoByIds },
}));

// Captures the `where` argument so tests can assert which predicates the
// roster query actually applies; rows are injected per test.
let capturedWhere: unknown;
let returnedRows: any[] = [];

const fakeDb: any = {
  select: vi.fn(function () {
    return {
      from: vi.fn(function () {
        return {
          innerJoin: vi.fn(function () {
            return {
              innerJoin: vi.fn(function () {
                return {
                  where: vi.fn(function (arg: unknown) {
                    capturedWhere = arg;
                    return {
                      orderBy: vi.fn(async () => returnedRows),
                    };
                  }),
                };
              }),
            };
          }),
        };
      }),
    };
  }),
};

const createCaller = (overrides: Record<string, unknown> = {}) =>
  workspaceAgentRouter.createCaller({
    clientIp: '10.0.0.1',
    serverDB: fakeDb,
    userId: 'u-viewer',
    workspaceId: 'ws-1',
    ...overrides,
  } as any);

/** Flatten a drizzle SQL tree into its leaf chunks (columns, params, strings). */
const flattenSql = (node: unknown): unknown[] => {
  if (node instanceof SQL) return node.queryChunks.flatMap(flattenSql);
  if (node instanceof Param) return [node.value];
  if (Array.isArray(node)) return node.flatMap(flattenSql);
  return [node];
};

const whereChunks = () => flattenSql(capturedWhere);

const columnChunks = () =>
  whereChunks()
    .filter((c) => {
      const col = c as any;
      return typeof col?.name === 'string' && col?.table !== undefined;
    })
    .map((c) => ({ column: (c as any).name as string, table: getTableName((c as any).table) }));

describe('workspaceAgentRouter.list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedWhere = undefined;
    returnedRows = [];
  });

  it('reads as empty in personal mode', async () => {
    const rows = await createCaller({ workspaceId: undefined }).list();
    expect(rows).toEqual([]);
  });

  it('filters joined agents and projects by caller visibility (public + own private)', async () => {
    returnedRows = [];
    await createCaller().list();

    const where = capturedWhere;
    expect(where).toBeInstanceOf(SQL);

    const chunks = whereChunks();
    const colNames = columnChunks().map((c) => `${c.table}.${c.column}`);
    // Both joined tables get a (public OR (private AND userId=caller)) filter.
    expect(colNames).toContain('agents.visibility');
    expect(colNames).toContain('agents.user_id');
    expect(colNames).toContain('projects.visibility');
    expect(colNames).toContain('projects.user_id');
    // The caller id must be bound into the private-visibility branch.
    expect(chunks).toContain('u-viewer');
    // The workspace scope is applied to the binding table, not the joins.
    expect(colNames).toContain('project_agents.workspace_id');
    expect(chunks).toContain('ws-1');
  });

  it('falls back to title then id for unnamed agents', async () => {
    returnedRows = [
      {
        agentAvatar: null,
        agentId: 'ag-1',
        agentName: null,
        agentTitle: 'Release Bot',
        enabled: true,
        maintainerId: null,
        projectId: 'p-1',
        projectName: 'Alpha',
      },
      {
        agentAvatar: null,
        agentId: 'ag-2',
        agentName: null,
        agentTitle: null,
        enabled: true,
        maintainerId: null,
        projectId: 'p-1',
        projectName: 'Alpha',
      },
    ];
    const rows = await createCaller().list();
    expect(rows[0].name).toBe('Release Bot');
    expect(rows[1].name).toBe('ag-2');
  });

  it('keeps fully-disabled agents as disabled and lists only enabled-binding projects', async () => {
    returnedRows = [
      {
        agentAvatar: null,
        agentId: 'ag-off',
        agentName: 'Dormant',
        agentTitle: null,
        enabled: false,
        maintainerId: null,
        projectId: 'p-1',
        projectName: 'Alpha',
      },
      {
        agentAvatar: null,
        agentId: 'ag-mixed',
        agentName: 'Mixed',
        agentTitle: null,
        enabled: false,
        maintainerId: null,
        projectId: 'p-1',
        projectName: 'Alpha',
      },
      {
        agentAvatar: null,
        agentId: 'ag-mixed',
        agentName: 'Mixed',
        agentTitle: null,
        enabled: true,
        maintainerId: null,
        projectId: 'p-2',
        projectName: 'Beta',
      },
    ];
    const rows = await createCaller().list();
    const off = rows.find((r) => r.id === 'ag-off');
    const mixed = rows.find((r) => r.id === 'ag-mixed');
    expect(off?.status).toBe('disabled');
    expect(off?.projects).toEqual([]);
    expect(mixed?.status).toBe('active');
    expect(mixed?.projects).toEqual([{ id: 'p-2', name: 'Beta' }]);
  });
});
