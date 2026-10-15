import type { PersistentAcpAgent } from '@orvilo/heterogeneous-agents/spawn';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildGatewayAcpFingerprint,
  buildGatewayAcpPoolKey,
  GatewayAcpPool,
  type GatewayAcpTurnSpec,
} from '../gatewayAcpPool';

interface FakeAgent extends PersistentAcpAgent {
  closed: boolean;
  options: any;
  reusable: boolean;
  sessionId: string | undefined;
}

const createFakeAgent = (options: any): FakeAgent => {
  const agent = {
    busy: false,
    close: vi.fn(() => {
      agent.closed = true;
    }),
    closed: false,
    interrupt: vi.fn(async () => true),
    options,
    pid: 1000,
    reusable: true,
    runTurn: vi.fn(),
    sessionId: undefined as string | undefined,
  };
  return agent as unknown as FakeAgent;
};

const setup = (overrides: { idleMs?: number; maxEntries?: number } = {}) => {
  const agents: FakeAgent[] = [];
  const createAgent = vi.fn(async (options: any) => {
    const agent = createFakeAgent(options);
    agents.push(agent);
    return agent;
  });
  const pool = new GatewayAcpPool({ createAgent, ...overrides });
  return { agents, createAgent, pool };
};

const spec = (overrides: Partial<GatewayAcpTurnSpec> = {}): GatewayAcpTurnSpec => ({
  agentOptions: { agentType: 'claude-code', cwd: '/repo' },
  fingerprint: 'fp-1',
  key: 'ws:topic-1:claude-code',
  ...overrides,
});

/** Lease, acquire like the runner does, and release. */
const runTurn = async (
  pool: GatewayAcpPool,
  turnSpec: GatewayAcpTurnSpec,
  acquire: { fresh?: boolean } = {},
) => {
  const lease = await pool.lease(turnSpec);
  const agent = await lease.agents.acquire({
    fresh: acquire.fresh ?? false,
    resumeSessionId: turnSpec.resumeSessionId,
  });
  lease.release();
  return agent as FakeAgent;
};

afterEach(() => {
  vi.useRealTimers();
});

describe('gatewayAcpPool keys and fingerprints', () => {
  it('keys entries by workspace, topic and agent type', () => {
    expect(buildGatewayAcpPoolKey({ agentType: 'claude-code', topicId: 't1' })).toBe(
      ':t1:claude-code',
    );
    expect(
      buildGatewayAcpPoolKey({ agentType: 'claude-code', topicId: 't1', workspaceId: 'ws' }),
    ).toBe('ws:t1:claude-code');
  });

  it('changes the fingerprint with env and is stable across key order', () => {
    const base = { agentType: 'claude-code', cwd: '/repo', env: { A: '1', B: '2' } };
    expect(buildGatewayAcpFingerprint(base)).toBe(
      buildGatewayAcpFingerprint({ ...base, env: { B: '2', A: '1' } }),
    );
    expect(buildGatewayAcpFingerprint(base)).not.toBe(
      buildGatewayAcpFingerprint({ ...base, env: { A: '1', B: '3' } }),
    );
    expect(
      buildGatewayAcpFingerprint({ ...base, env: { ANTHROPIC_API_KEY: 'sk-secret' } }),
    ).not.toContain('sk-secret');
  });
});

describe('GatewayAcpPool', () => {
  it('reuses the warm agent when the fingerprint matches', async () => {
    const { createAgent, pool } = setup();

    const first = await runTurn(pool, spec());
    first.sessionId = 'native-1';
    const second = await runTurn(pool, spec({ resumeSessionId: 'native-1' }));

    expect(second).toBe(first);
    expect(createAgent).toHaveBeenCalledOnce();
    expect(createAgent.mock.calls[0][0]).toMatchObject({ warmIdleMs: 10 * 60 * 1000 });
  });

  it('replaces the agent when the fingerprint changes', async () => {
    const { createAgent, pool } = setup();

    const first = await runTurn(pool, spec());
    const second = await runTurn(pool, spec({ fingerprint: 'fp-2' }));

    expect(second).not.toBe(first);
    expect(first.close).toHaveBeenCalledOnce();
    expect(createAgent).toHaveBeenCalledTimes(2);
  });

  it('replaces an agent that is no longer reusable', async () => {
    const { pool } = setup();

    const first = await runTurn(pool, spec());
    first.reusable = false;
    const second = await runTurn(pool, spec());

    expect(second).not.toBe(first);
    expect(first.close).toHaveBeenCalled();
  });

  it('recreates with resume when the requested session differs from the live one', async () => {
    const { createAgent, pool } = setup();

    const first = await runTurn(pool, spec());
    first.sessionId = 'native-1';
    const second = await runTurn(pool, spec({ resumeSessionId: 'native-other' }));

    expect(second).not.toBe(first);
    expect(first.close).toHaveBeenCalledOnce();
    expect(createAgent.mock.calls[1][0]).toMatchObject({ resumeSessionId: 'native-other' });
  });

  it('starts a new session without resume on a fresh acquire', async () => {
    const { createAgent, pool } = setup();

    const lease = await pool.lease(spec({ resumeSessionId: 'native-1' }));
    const first = await lease.agents.acquire({ fresh: false, resumeSessionId: 'native-1' });
    const retry = await lease.agents.acquire({ fresh: true });
    lease.release();

    expect(retry).not.toBe(first);
    expect((first as FakeAgent).close).toHaveBeenCalledOnce();
    expect(createAgent.mock.calls[0][0]).toMatchObject({ resumeSessionId: 'native-1' });
    expect(createAgent.mock.calls[1][0]).not.toHaveProperty('resumeSessionId');
  });

  it('evicts the least recently used idle entry past the cap', async () => {
    const { pool } = setup({ maxEntries: 2 });

    const a = await runTurn(pool, spec({ key: 'a' }));
    await runTurn(pool, spec({ key: 'b' }));
    // Touch `a` so `b` becomes the LRU entry.
    await runTurn(pool, spec({ key: 'a' }));
    await runTurn(pool, spec({ key: 'c' }));

    expect(pool.has('a')).toBe(true);
    expect(pool.has('b')).toBe(false);
    expect(pool.has('c')).toBe(true);
    expect(a.close).not.toHaveBeenCalled();
  });

  it('never evicts an entry whose turn is in flight', async () => {
    const { pool } = setup({ maxEntries: 1 });

    const busy = await pool.lease(spec({ key: 'a' }));
    await runTurn(pool, spec({ key: 'b' }));

    expect(pool.has('a')).toBe(true);
    busy.release();
  });

  it('drops an idle entry after the TTL', async () => {
    vi.useFakeTimers();
    const { pool } = setup({ idleMs: 1000 });

    const agent = await runTurn(pool, spec());
    await vi.advanceTimersByTimeAsync(999);
    expect(pool.has(spec().key)).toBe(true);

    await vi.advanceTimersByTimeAsync(1);
    expect(pool.has(spec().key)).toBe(false);
    expect(agent.close).toHaveBeenCalledOnce();
  });

  it('serializes turns on one entry', async () => {
    const { pool } = setup();
    const order: string[] = [];

    const first = await pool.lease(spec());
    const secondLease = pool.lease(spec()).then((lease) => {
      order.push('second-start');
      return lease;
    });
    await Promise.resolve();
    await Promise.resolve();
    order.push('first-end');
    first.release();
    (await secondLease).release();

    expect(order).toEqual(['first-end', 'second-start']);
  });

  it('lets a waiting turn start over after the entry was evicted', async () => {
    const { createAgent, pool } = setup();

    const first = await pool.lease(spec());
    const second = pool.lease(spec());
    first.evict();
    first.release();
    const lease = await second;
    await lease.agents.acquire({ fresh: false });
    lease.release();

    expect(createAgent).toHaveBeenCalledTimes(2);
    expect(pool.has(spec().key)).toBe(true);
  });

  it('releases the slot when the agent cannot be created', async () => {
    const { createAgent, pool } = setup();
    createAgent.mockRejectedValueOnce(new Error('boom'));

    await expect(pool.lease(spec())).rejects.toThrow('boom');
    const agent = await runTurn(pool, spec());
    expect(agent).toBeDefined();
  });

  it('closeAll closes every agent', async () => {
    const { pool } = setup();

    const a = await runTurn(pool, spec({ key: 'a' }));
    const b = await runTurn(pool, spec({ key: 'b' }));
    pool.closeAll();

    expect(a.close).toHaveBeenCalledOnce();
    expect(b.close).toHaveBeenCalledOnce();
    expect(pool.size).toBe(0);
  });

  it('mounts one MCP route per entry and binds each turn to it', async () => {
    const server = {
      bindRoute: vi.fn((_route: string, _op: string, bridge: unknown) => bridge),
      registerRoute: vi.fn(),
      releaseRoute: vi.fn(),
      stop: vi.fn(async () => {}),
      urlForOperation: vi.fn((id: string) => `http://127.0.0.1:1/mcp?op=${id}`),
    };
    const createMcpServer = vi.fn(async () => server as any);
    const createAgent = vi.fn(async (options: any) => createFakeAgent(options));
    const pool = new GatewayAcpPool({ createAgent, createMcpServer });
    const builtinTools = [{ apis: [{ name: 'run' }], identifier: 'tool' }];

    for (const operationId of ['op-1', 'op-2']) {
      const lease = await pool.lease(spec({ builtinTools }));
      const bridge = {} as any;
      expect(
        lease.bindTurn({
          bridge,
          context: { operationJwt: `jwt-${operationId}`, serverUrl: 'https://s' },
          operationId,
        }),
      ).toBe(bridge);
      lease.release();
    }

    expect(createMcpServer).toHaveBeenCalledOnce();
    expect(server.registerRoute).toHaveBeenCalledOnce();
    const routeId = server.registerRoute.mock.calls[0][0];
    expect(server.bindRoute.mock.calls.map((call) => call[1])).toEqual(['op-1', 'op-2']);
    expect(server.releaseRoute).toHaveBeenCalledTimes(2);
    expect(createAgent.mock.calls[0][0].mcpServers).toEqual([
      { name: 'orvilo_cc', type: 'http', url: `http://127.0.0.1:1/mcp?op=${routeId}` },
    ]);

    pool.closeAll();
    expect(server.stop).toHaveBeenCalledOnce();
  });
});
