import { EventEmitter } from 'node:events';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDevOrchestrator } from '../devOrchestrator.mjs';

class FakeChild extends EventEmitter {
  kill = vi.fn();
}

const createHarness = (overrides = {}) => {
  const spawned = [];
  const watchers = [];
  const state = { bundlesExist: false, mtime: Date.now() + 1, portReady: false };

  const options = {
    checkPort: vi.fn(async () => state.portReady),
    desktopRoot: '/repo/apps/desktop',
    electronBin: '/bin/electron',
    exit: vi.fn(),
    existsSync: vi.fn(() => state.bundlesExist),
    log: vi.fn(),
    logError: vi.fn(),
    nodeBin: '/bin/node',
    rmSync: vi.fn(),
    spawn: vi.fn((bin, args, opts) => {
      const child = new FakeChild();
      spawned.push({ args, bin, child, opts });
      return child;
    }),
    statSync: vi.fn(() => ({ mtimeMs: state.mtime })),
    viteBin: '/repo/node_modules/vite/bin/vite.js',
    vitePort: 5199,
    watch: vi.fn((dir, cb) => {
      watchers.push(cb);
    }),
    ...overrides,
  };

  const orchestrator = createDevOrchestrator(options);
  const viteChildren = () => spawned.filter((s) => s.bin === '/bin/node');
  const electronSpawns = () => spawned.filter((s) => s.bin === '/bin/electron');

  const becomeReady = async () => {
    state.bundlesExist = true;
    state.portReady = true;
    await vi.advanceTimersByTimeAsync(2000);
  };

  return {
    becomeReady,
    electronSpawns,
    options,
    orchestrator,
    spawned,
    state,
    viteChildren,
    watchers,
  };
};

describe('createDevOrchestrator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('spawns the three vite processes through the node binary (no pnpm shim)', () => {
    const h = createHarness();
    h.orchestrator.start();

    expect(h.viteChildren()).toHaveLength(3);
    for (const { args, opts } of h.viteChildren()) {
      expect(args[0]).toBe('/repo/node_modules/vite/bin/vite.js');
      expect(opts.cwd).toBe('/repo/apps/desktop');
    }
    const configs = h.viteChildren().map(({ args }) => args.at(-1));
    expect(configs).toEqual([
      'vite.renderer.config.ts',
      'vite.main.config.ts',
      'vite.preload.config.ts',
    ]);
  });

  it('wipes the stale dist before spawning the watch builds', () => {
    const h = createHarness();
    h.orchestrator.start();

    expect(h.options.rmSync).toHaveBeenCalledWith('/repo/apps/desktop/dist', {
      force: true,
      recursive: true,
    });
    expect(h.options.rmSync.mock.invocationCallOrder[0]).toBeLessThan(
      h.options.spawn.mock.invocationCallOrder[0],
    );
  });

  it('shuts everything down when a vite child exits early', () => {
    const h = createHarness();
    h.orchestrator.start();

    h.viteChildren()[1].child.emit('exit', 7);

    expect(h.options.exit).toHaveBeenCalledWith(7);
    for (const { child } of h.viteChildren()) {
      expect(child.kill).toHaveBeenCalled();
    }
    expect(h.electronSpawns()).toHaveLength(0);
  });

  it('launches electron only after bundles are stable and the renderer port accepts', async () => {
    const h = createHarness();
    h.orchestrator.start();

    h.state.bundlesExist = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.electronSpawns()).toHaveLength(0);

    h.state.portReady = true;
    await vi.advanceTimersByTimeAsync(400);

    expect(h.electronSpawns()).toHaveLength(1);
    const { args, opts } = h.electronSpawns()[0];
    expect(args).toEqual(['.']);
    expect(opts.env.ELECTRON_RENDERER_URL).toBe('http://127.0.0.1:5199');
    expect(opts.env.NODE_ENV).toBe('development');
    expect(h.options.watch).toHaveBeenCalledTimes(2);
  });

  it('waits for the bundle signature to stay quiet before launching', async () => {
    const h = createHarness();
    h.orchestrator.start();
    h.state.bundlesExist = true;
    h.state.portReady = true;

    await vi.advanceTimersByTimeAsync(600);
    h.state.mtime += 1;
    await vi.advanceTimersByTimeAsync(600);
    expect(h.electronSpawns()).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1400);
    expect(h.electronSpawns()).toHaveLength(1);
  });

  it('ignores bundles left over from a previous run until the watch build rewrites them', async () => {
    const h = createHarness();
    h.state.mtime = Date.now() - 1;
    h.orchestrator.start();
    h.state.bundlesExist = true;
    h.state.portReady = true;

    await vi.advanceTimersByTimeAsync(3000);
    expect(h.electronSpawns()).toHaveLength(0);

    h.state.mtime = Date.now();
    await vi.advanceTimersByTimeAsync(2000);
    expect(h.electronSpawns()).toHaveLength(1);
  });

  it('passes extra CLI args through to electron', async () => {
    const h = createHarness({ electronArgs: ['--remote-debugging-port=9223', '--foo'] });
    h.orchestrator.start();
    await h.becomeReady();

    expect(h.electronSpawns()[0].args).toEqual(['.', '--remote-debugging-port=9223', '--foo']);
  });

  it('restarts electron when a bundle change fires the watcher', async () => {
    const h = createHarness();
    h.orchestrator.start();
    await h.becomeReady();

    const electron = h.electronSpawns()[0].child;
    h.watchers[0]('change');
    await vi.advanceTimersByTimeAsync(500);
    expect(electron.kill).toHaveBeenCalled();

    electron.emit('exit', null);
    expect(h.electronSpawns()).toHaveLength(2);
    expect(h.options.exit).not.toHaveBeenCalled();
  });

  it('debounces rapid bundle changes into one restart', async () => {
    const h = createHarness();
    h.orchestrator.start();
    await h.becomeReady();

    const electron = h.electronSpawns()[0].child;
    h.watchers[0]('change');
    await vi.advanceTimersByTimeAsync(200);
    h.watchers[1]('change');
    await vi.advanceTimersByTimeAsync(500);

    expect(electron.kill).toHaveBeenCalledTimes(1);
  });

  it('names every changed bundle in the restart log, once', async () => {
    const h = createHarness();
    h.orchestrator.start();
    await h.becomeReady();

    h.watchers[0]('change', 'index.js');
    h.watchers[1]('change', 'index.js');
    await vi.advanceTimersByTimeAsync(500);

    const message = h.options.log.mock.calls.at(-1)[0];
    expect(message).toContain('[desktop-dev] main/preload bundle changed');
    expect(message).toContain('dist/main/index.js: change');
    expect(message).toContain('dist/preload/index.js: change');

    h.electronSpawns()[0].child.emit('exit', null);
    h.watchers[0]('change', 'index.js');
    await vi.advanceTimersByTimeAsync(500);

    expect(h.options.log.mock.calls.at(-1)[0]).not.toContain('dist/preload/index.js');
  });

  it('stops the watchers when electron is quit by hand', async () => {
    const h = createHarness();
    h.orchestrator.start();
    await h.becomeReady();

    h.electronSpawns()[0].child.emit('exit', 0);

    expect(h.options.exit).toHaveBeenCalledWith(0);
    for (const { child } of h.viteChildren()) {
      expect(child.kill).toHaveBeenCalled();
    }
  });

  it('shutdown kills electron and all vite children exactly once', async () => {
    const h = createHarness();
    h.orchestrator.start();
    await h.becomeReady();

    h.orchestrator.shutdown(0);
    h.orchestrator.shutdown(1);

    expect(h.options.exit).toHaveBeenCalledTimes(1);
    expect(h.options.exit).toHaveBeenCalledWith(0);
    expect(h.electronSpawns()[0].child.kill).toHaveBeenCalled();
    for (const { child } of h.viteChildren()) {
      expect(child.kill).toHaveBeenCalled();
    }
  });

  it('fails with exit(1) when the initial build never produces bundles', async () => {
    const h = createHarness();
    h.orchestrator.start();

    await vi.advanceTimersByTimeAsync(121_000);

    expect(h.options.logError).toHaveBeenCalled();
    expect(h.options.exit).toHaveBeenCalledWith(1);
    expect(h.electronSpawns()).toHaveLength(0);
  });
  describe('embedded CLI', () => {
    const cliBuildCommand = { args: ['run', 'build'], bin: '/bin/bun', cwd: '/repo/apps/cli' };
    const cliBuilds = (h) => h.spawned.filter((s) => s.bin === '/bin/bun');

    it('builds the CLI in its own package and holds electron until that finishes', async () => {
      const h = createHarness({ cliBuildCommand });
      h.orchestrator.start();

      expect(cliBuilds(h)).toHaveLength(1);
      expect(cliBuilds(h)[0].args).toEqual(['run', 'build']);
      expect(cliBuilds(h)[0].opts.cwd).toBe('/repo/apps/cli');

      await h.becomeReady();
      expect(h.electronSpawns()).toHaveLength(0);

      cliBuilds(h)[0].child.emit('exit', 0);
      await vi.advanceTimersByTimeAsync(400);

      expect(h.electronSpawns()).toHaveLength(1);
      expect(h.options.logError).not.toHaveBeenCalled();
    });

    it('reports a failed CLI build and still starts electron', async () => {
      const h = createHarness({ cliBuildCommand });
      h.orchestrator.start();

      cliBuilds(h)[0].child.emit('exit', 1);
      await h.becomeReady();

      expect(h.electronSpawns()).toHaveLength(1);
      expect(h.options.logError).toHaveBeenCalledWith(
        expect.stringContaining('embedded CLI build failed (exit code 1)'),
      );
      expect(h.options.exit).not.toHaveBeenCalled();
    });

    it('reports a build tool that cannot be started', async () => {
      const h = createHarness({ cliBuildCommand });
      h.orchestrator.start();

      cliBuilds(h)[0].child.emit('error', new Error('spawn bun ENOENT'));
      await h.becomeReady();

      expect(h.electronSpawns()).toHaveLength(1);
      expect(h.options.logError).toHaveBeenCalledWith(expect.stringContaining('spawn bun ENOENT'));
    });

    it('stops a CLI build and the commands it started on shutdown', () => {
      const killTree = vi.fn();
      const h = createHarness({ cliBuildCommand, killTree });
      h.orchestrator.start();

      h.orchestrator.shutdown(0);

      expect(killTree).toHaveBeenCalledWith(cliBuilds(h)[0].child);
    });

    it('removes the previous CLI when its replacement fails to build', async () => {
      const output = '/repo/apps/cli/dist/index.js';
      const h = createHarness({ cliBuildCommand: { ...cliBuildCommand, output } });
      h.orchestrator.start();

      cliBuilds(h)[0].child.emit('exit', 1);

      expect(h.options.rmSync).toHaveBeenCalledWith(output, { force: true });
    });

    it('lets a first CLI build outlast the bundle deadline', async () => {
      const h = createHarness({ cliBuildCommand, initialBuildTimeoutMs: 5000 });
      h.orchestrator.start();

      await h.becomeReady();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(h.options.exit).not.toHaveBeenCalled();

      cliBuilds(h)[0].child.emit('exit', 0);
      await vi.advanceTimersByTimeAsync(500);
      expect(h.electronSpawns()).toHaveLength(1);
    });

    describe('with other dev instances of the same checkout', () => {
      const lockFile = '/repo/apps/cli/node_modules/.cache/dev-cli.lock';
      const locked = (owner, alive) => {
        const lockMtimeMs = Date.now() + 1;
        return {
          cliBuildCommand: { ...cliBuildCommand, lockFile },
          isProcessAlive: vi.fn(() => alive),
          mkdirSync: vi.fn(),
          pid: 100,
          readFileSync: vi.fn((file) =>
            file === lockFile
              ? String(owner)
              : JSON.stringify({ owner, lockMtimeMs, problem: null }),
          ),
          writeFileSync: vi.fn((file, content, options) => {
            if (owner && options?.flag === 'wx') throw new Error('EEXIST');
          }),
        };
      };

      const sharedHarness = () => {
        // Model only the injected filesystem/process boundaries. Both real
        // orchestrators use their original spawn/state harness and FakeChild.
        const output = '/repo/apps/cli/dist/index.js';
        const files = new Map();
        const alive = new Set([100, 200]);
        const createInstance = (pid) => {
          let h;
          h = createHarness({
            cliBuildCommand: { ...cliBuildCommand, lockFile, output },
            pid,
            isProcessAlive: vi.fn((owner) => alive.has(owner)),
            mkdirSync: vi.fn(),
            readFileSync: vi.fn((file) => {
              if (!files.has(file)) throw new Error('ENOENT');
              return files.get(file).content;
            }),
            writeFileSync: vi.fn((file, content, options) => {
              if (options?.flag === 'wx' && files.has(file)) throw new Error('EEXIST');
              files.set(file, { content: String(content), mtimeMs: Date.now() });
            }),
            rmSync: vi.fn((file) => files.delete(file)),
            existsSync: vi.fn((file) => (file === output ? files.has(file) : h.state.bundlesExist)),
            statSync: vi.fn((file) => files.get(file) ?? { mtimeMs: h.state.mtime }),
            killTree: vi.fn(),
          });
          return h;
        };
        return { alive, files, output, owner: createInstance(200), peer: createInstance(100) };
      };

      it('holds a second instance with ready bundles until the shared initial build actually exits', async () => {
        const { owner, peer } = sharedHarness();
        owner.orchestrator.start();
        peer.orchestrator.start();
        await peer.becomeReady();

        expect(cliBuilds(owner)).toHaveLength(1);
        expect(cliBuilds(peer)).toHaveLength(0);
        expect(peer.electronSpawns()).toHaveLength(0);
        expect(peer.options.watch).not.toHaveBeenCalled();
        // A legitimate first shared CLI build can outlast the bundle deadline.
        await owner.becomeReady();
        await vi.advanceTimersByTimeAsync(121_000);
        expect(peer.options.exit).not.toHaveBeenCalled();
        expect(peer.electronSpawns()).toHaveLength(0);

        cliBuilds(owner)[0].child.emit('exit', 0);
        await vi.advanceTimersByTimeAsync(400);
        expect(peer.electronSpawns()).toHaveLength(1);
        expect(cliBuilds(peer)).toHaveLength(0);
      });

      it('ignores old output, stale results and a partially published shared result', async () => {
        const { owner, peer, files, output } = sharedHarness();
        files.set(output, { content: 'old CLI', mtimeMs: Date.now() - 100 });
        owner.orchestrator.start();
        peer.orchestrator.start();
        files.set(`${lockFile}.settled`, {
          content: JSON.stringify({ owner: 200, lockMtimeMs: Date.now() - 1, problem: null }),
        });
        await peer.becomeReady();
        expect(peer.electronSpawns()).toHaveLength(0);
        files.set(`${lockFile}.settled`, { content: '{"owner":200' });
        await vi.advanceTimersByTimeAsync(400);
        expect(peer.electronSpawns()).toHaveLength(0);
        cliBuilds(owner)[0].child.emit('exit', 0);
        await vi.advanceTimersByTimeAsync(400);
        expect(peer.electronSpawns()).toHaveLength(1);
        expect(cliBuilds(peer)).toHaveLength(0);
      });

      it('propagates the shared build failure after output cleanup without launching a duplicate build', async () => {
        const { owner, peer, files, output } = sharedHarness();
        files.set(output, { content: 'old CLI', mtimeMs: Date.now() - 100 });
        owner.orchestrator.start();
        peer.orchestrator.start();
        await peer.becomeReady();
        expect(peer.electronSpawns()).toHaveLength(0);
        cliBuilds(owner)[0].child.emit('exit', 7);
        expect(files.has(output)).toBe(false);
        await vi.advanceTimersByTimeAsync(400);
        expect(peer.electronSpawns()).toHaveLength(1);
        expect(cliBuilds(peer)).toHaveLength(0);
        expect(peer.options.logError).toHaveBeenCalledWith(
          expect.stringContaining('embedded CLI build failed (exit code 7)'),
        );
        expect(owner.options.rmSync.mock.invocationCallOrder.at(-1)).toBeLessThan(
          owner.options.writeFileSync.mock.invocationCallOrder.at(-1),
        );
      });

      it('publishes a shared spawn error once even if an exit follows it', async () => {
        const { owner, peer } = sharedHarness();
        owner.orchestrator.start();
        peer.orchestrator.start();
        await peer.becomeReady();
        const child = cliBuilds(owner)[0].child;
        child.emit('error', new Error('spawn bun ENOENT'));
        child.emit('exit', 1);
        await vi.advanceTimersByTimeAsync(400);
        expect(peer.electronSpawns()).toHaveLength(1);
        expect(peer.options.logError).toHaveBeenCalledWith(
          expect.stringContaining('spawn bun ENOENT'),
        );
        expect(
          owner.options.writeFileSync.mock.calls.filter(([file]) => file === `${lockFile}.settled`),
        ).toHaveLength(1);
      });

      it('takes over a dead shared owner and still waits for its own real build completion', async () => {
        const { owner, peer, alive } = sharedHarness();
        owner.orchestrator.start();
        peer.orchestrator.start();
        await peer.becomeReady();
        alive.delete(200);
        await vi.advanceTimersByTimeAsync(400);
        expect(cliBuilds(peer)).toHaveLength(1);
        expect(peer.electronSpawns()).toHaveLength(0);
        cliBuilds(peer)[0].child.emit('exit', 0);
        await vi.advanceTimersByTimeAsync(400);
        expect(peer.electronSpawns()).toHaveLength(1);
        expect(peer.options.killTree).not.toHaveBeenCalled();
      });

      it('reuses the original claim path when an owner stops and releases its lock', async () => {
        const { owner, peer, files } = sharedHarness();
        owner.orchestrator.start();
        peer.orchestrator.start();
        await peer.becomeReady();
        owner.orchestrator.shutdown(0);
        expect(owner.options.killTree).toHaveBeenCalledWith(cliBuilds(owner)[0].child);
        expect(files.has(lockFile)).toBe(false);
        // The killed child can emit its exit later, after lock cleanup.
        cliBuilds(owner)[0].child.emit('exit', null);
        expect(files.has(`${lockFile}.settled`)).toBe(false);
        await vi.advanceTimersByTimeAsync(400);
        expect(cliBuilds(peer)).toHaveLength(1);
        expect(peer.electronSpawns()).toHaveLength(0);
        cliBuilds(peer)[0].child.emit('exit', 0);
        await vi.advanceTimersByTimeAsync(400);
        expect(peer.electronSpawns()).toHaveLength(1);
      });

      it('leaves the owner lock, completion record and build alone when a waiting peer stops', async () => {
        const { owner, peer, files } = sharedHarness();
        owner.orchestrator.start();
        peer.orchestrator.start();
        await peer.becomeReady();
        peer.orchestrator.shutdown(0);
        expect(peer.options.killTree).not.toHaveBeenCalled();
        expect(peer.options.rmSync).not.toHaveBeenCalledWith(lockFile, { force: true });
        expect(peer.options.rmSync).not.toHaveBeenCalledWith(`${lockFile}.settled`, {
          force: true,
        });
        expect(files.get(lockFile).content).toBe('200');
        cliBuilds(owner)[0].child.emit('exit', 0);
        await vi.advanceTimersByTimeAsync(400);
        expect(peer.electronSpawns()).toHaveLength(0);
        expect(files.has(`${lockFile}.settled`)).toBe(true);
        owner.orchestrator.shutdown(0);
        expect(files.has(`${lockFile}.settled`)).toBe(false);
      });

      it('reuses the settled CLI of a running instance instead of rebuilding under it', async () => {
        const h = createHarness(locked(200, true));
        h.orchestrator.start();
        await h.becomeReady();

        expect(cliBuilds(h)).toHaveLength(0);
        expect(h.electronSpawns()).toHaveLength(1);

        h.orchestrator.shutdown(0);
        expect(h.options.rmSync).not.toHaveBeenCalledWith(lockFile, { force: true });
      });

      it('takes over the claim of an instance that is gone', () => {
        const h = createHarness(locked(200, false));
        h.orchestrator.start();

        expect(cliBuilds(h)).toHaveLength(1);
        expect(h.options.writeFileSync).toHaveBeenLastCalledWith(lockFile, '100');
      });

      it('releases its claim when it stops', () => {
        const h = createHarness(locked(undefined, false));
        h.orchestrator.start();
        h.orchestrator.shutdown(0);

        expect(h.options.rmSync).toHaveBeenCalledWith(lockFile, { force: true });
      });
    });
  });
});
