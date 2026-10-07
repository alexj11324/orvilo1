import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __testing } from './devStartupSequence.mts';

const { spawn } = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ default: { spawn }, spawn }));
vi.mock('dotenv', () => ({ default: { config: () => ({}) } }));
vi.mock('node:net', () => ({
  default: {
    createServer: () => {
      const server = new EventEmitter();
      Object.assign(server, {
        close: (done: () => void) => done(),
        listen: (_options: unknown, done: () => void) => done(),
        unref: vi.fn(),
      });
      return server;
    },
    createConnection: () => {
      const socket = new EventEmitter();
      Object.assign(socket, { destroy: vi.fn(), setTimeout: vi.fn() });
      queueMicrotask(() => socket.emit('error'));
      return socket;
    },
  },
}));

const publisher = `pk_test_${Buffer.from('example-development.clerk.accounts.dev$').toString('base64')}`;
const validEnv = {
  CLERK_ISSUER: 'https://example-development.clerk.accounts.dev',
  CLERK_SECRET_KEY: 'sk_test_placeholder',
  VITE_CLERK_PUBLISHABLE_KEY: publisher,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv('PORT', '31607');
  vi.stubEnv('SPA_PORT', '5300');
  vi.stubEnv('AUTH_SPA_PORT_RR', '3019');
  for (const [key, value] of Object.entries(validEnv)) vi.stubEnv(key, value);
  spawn.mockImplementation(() =>
    Object.assign(new EventEmitter(), {
      exitCode: null,
      pid: 900000 + spawn.mock.calls.length,
      signalCode: null,
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  spawn.mockClear();
});

describe('local full-stack auth startup', () => {
  it('reserves the selected Next and Vite ports before choosing the portal port', async () => {
    expect(await __testing.findFreePort(3018, [3018, 3019])).toBe(3020);
  });

  it('binds product, portal, proxy, authorized parties and cookies to selected ports', () => {
    const env = __testing.createLocalAuthEnv(
      {
        ...validEnv,
        AUTH_COOKIE_DOMAIN: '.example.com',
        APP_URL: 'https://example.com',
        CLERK_ISSUER: '',
        CLERK_JWT_KEY: 'parent-instance-pem',
      },
      31607,
      3019,
    );
    expect(env).toMatchObject({
      APP_URL: 'http://localhost:31607',
      AUTH_ACCOUNTS_URL: 'http://localhost:3019',
      AUTH_API_PROXY: 'http://localhost:31607',
      AUTH_COOKIE_DOMAIN: '',
      AUTH_SPA_PORT_RR: '3019',
      CLERK_AUTHORIZED_PARTIES: 'http://localhost:3019',
      CLERK_ISSUER: validEnv.CLERK_ISSUER,
      CLERK_JWT_KEY: '',
      INTERNAL_APP_URL: 'http://localhost:31607',
      VITE_CLERK_PUBLISHABLE_KEY: publisher,
      VITE_PORTAL_PRODUCT_ORIGIN: 'http://localhost:31607',
    });
  });

  it('uses the selected Clerk instance directly despite an inherited proxy', () => {
    for (const proxy of ['/__clerk', 'https://production.example.com/__clerk']) {
      const parentEnv = { ...validEnv, VITE_CLERK_PROXY_URL: proxy };
      const env = __testing.createLocalAuthEnv(parentEnv, 31607, 3019);
      expect(env.VITE_CLERK_PROXY_URL).toBe('');
      expect(env.CLERK_ISSUER).toBe(validEnv.CLERK_ISSUER);
      expect(parentEnv.VITE_CLERK_PROXY_URL).toBe(proxy);
    }
  });

  it('accepts a canonically matching declared issuer', () => {
    const env = __testing.createLocalAuthEnv(
      { ...validEnv, CLERK_ISSUER: `${validEnv.CLERK_ISSUER}:443/` },
      31607,
      3019,
    );
    expect(env.CLERK_ISSUER).toBe(validEnv.CLERK_ISSUER);
  });

  it.each([
    ['VITE_CLERK_PUBLISHABLE_KEY', ''],
    ['VITE_CLERK_PUBLISHABLE_KEY', publisher.replace('pk_test_', 'pk_live_')],
    ['VITE_CLERK_PUBLISHABLE_KEY', 'pk_test_invalid'],
    ['CLERK_SECRET_KEY', ''],
    ['CLERK_SECRET_KEY', 'sk_live_placeholder'],
    ['CLERK_ISSUER', 'https://other.clerk.accounts.dev'],
    ['CLERK_ISSUER', 'http://example-development.clerk.accounts.dev'],
    ['CLERK_ISSUER', 'https://example-development.clerk.accounts.dev/path'],
    ['CLERK_ISSUER', 'https://userinfo@example-development.clerk.accounts.dev'],
  ])('rejects incompatible %s before spawning and omits its value', async (name, value) => {
    vi.stubEnv(name, value);
    const error = await __testing.main().catch((error: Error) => error);
    expect(error).toBeInstanceOf(Error);
    expect(String(error)).toContain(name);
    if (value) expect(String(error)).not.toContain(value);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('starts all three existing processes and terminates them together', async () => {
    const listeners = new Map<string, (...args: unknown[]) => void>();
    vi.spyOn(process, 'on').mockImplementation((event, listener) => {
      listeners.set(event, listener);
      return process;
    });
    const kill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const running = __testing.main();
    await vi.waitFor(() => expect(spawn).toHaveBeenCalledTimes(3));
    expect(spawn.mock.calls.map(([command, args]) => [command, args])).toEqual([
      ['bunx', ['next', 'dev', '-p', '31607']],
      ['bun', ['run', 'dev:spa']],
      ['pnpm', ['--filter', '@orvilo/auth', 'dev']],
    ]);
    for (const [, , options] of spawn.mock.calls) {
      expect(options.env.AUTH_ACCOUNTS_URL).toBe('http://localhost:3019');
      expect(options.env.APP_URL).toBe('http://localhost:31607');
    }
    listeners.get('SIGTERM')?.();
    expect(kill.mock.calls).toEqual([
      [-900003, 'SIGTERM'],
      [-900002, 'SIGTERM'],
      [-900001, 'SIGTERM'],
    ]);
    for (const child of spawn.mock.results.map((result) => result.value)) {
      child.exitCode = 0;
      child.emit('exit', 0);
    }
    await running;
    process.exitCode = 0;
  });
});
