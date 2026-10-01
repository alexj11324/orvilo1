/**
 * Shared support for the Prime embedded-harness acceptance suite (phase 6).
 *
 * Everything here is real: real child process running dist/runner.mjs, real
 * HarnessTransport on its stdio, real PGlite schema/crypto, real local HTTP.
 * The only substitution is `realProcessSupervisor`, which stands in for
 * DockerProcessTreeSupervisor at the documented seam — the box has no Docker
 * (prime-embedded-acceptance.md records what only a container proves).
 */
import { type ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import {
  createServer,
  type IncomingHttpHeaders,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough, type Readable, type Writable } from 'node:stream';
import { pathToFileURL } from 'node:url';

import { HarnessTransport } from '@orvilo/agent-execution/controlPlane/harnessTransport';
import type {
  ControlResult,
  DockerSupervisorOptions,
  EmbeddedArtifactManifest,
  IsolatedLaunch,
  IsolationEvidence,
  QuiescenceProof,
} from '@orvilo/agent-execution/controlPlane/server';
import { isEmbeddedArtifactManifest } from '@orvilo/agent-execution/controlPlane/server';

import type { HostSupervisorPort } from './coreRuntimeHost';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../../../..');

export const RUNNER_ARTIFACT = path.join(REPO_ROOT, 'packages/prime-harness/dist/runner.mjs');
export const RUNNER_MANIFEST = path.join(
  REPO_ROOT,
  'packages/prime-harness/dist/runner.manifest.json',
);
export const NETGUARD_MODULE = path.join(
  REPO_ROOT,
  'scripts/acceptance/prime-embedded-netguard.mjs',
);

/** CI has no vendor install and no runner build — real-process cases gate on this. */
export const runnerAvailable = (): boolean =>
  existsSync(RUNNER_ARTIFACT) && existsSync(RUNNER_MANIFEST);

export const loadRunnerManifest = (): EmbeddedArtifactManifest => {
  const parsed: unknown = JSON.parse(readFileSync(RUNNER_MANIFEST, 'utf8'));
  if (!isEmbeddedArtifactManifest(parsed))
    throw new Error('Runner manifest failed shape validation');
  return parsed;
};

export interface WireFrame {
  direction: 'host-to-runner' | 'runner-to-host';
  line: string;
}

export interface SpawnedRunner {
  child: ChildProcessWithoutNullStreams;
  /** Resolves with the exit code once the process exits; null on signal. */
  exited: Promise<number | null>;
  stderrText: () => string;
  transcript: WireFrame[];
  transport: HarnessTransport;
}

/** Tee a stream so every wire frame is captured verbatim for the transcript. */
const tapReadable = (source: Readable, onChunk: (chunk: string) => void): PassThrough => {
  const tap = new PassThrough();
  source.on('data', (chunk: Buffer) => onChunk(chunk.toString('utf8')));
  source.pipe(tap);
  return tap;
};

const tapWritable = (sink: Writable, onChunk: (chunk: string) => void): PassThrough => {
  const tap = new PassThrough();
  tap.on('data', (chunk: Buffer) => onChunk(chunk.toString('utf8')));
  tap.pipe(sink);
  // HarnessTransport.close() destroys our tap; the child must still see EOF —
  // pipe does not forward destroy, so close the real stdin explicitly.
  tap.on('close', () => sink.end());
  return tap;
};

export interface SpawnRunnerOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** Extra node args before the artifact, e.g. ['--import', fileURL]. */
  nodeArgs?: string[];
  /** When set, writes transcript frames here as JSONL for the evidence bundle. */
  transcriptPath?: string;
}

/**
 * Spawn the real runner and wrap it in the production HarnessTransport — the
 * same channel PrimeEmbeddedRuntime uses. Transcript lines are raw ndjson.
 */
export const spawnRunner = (options: SpawnRunnerOptions = {}): SpawnedRunner => {
  const transcript: WireFrame[] = [];
  const stderrChunks: Buffer[] = [];
  const child = spawn(process.execPath, [...(options.nodeArgs ?? []), RUNNER_ARTIFACT], {
    cwd: options.cwd,
    env: options.env ?? {},
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdin = tapWritable(child.stdin, (chunk) => {
    for (const line of chunk.split('\n').filter(Boolean))
      transcript.push({ direction: 'host-to-runner', line });
  });
  const stdout = tapReadable(child.stdout, (chunk) => {
    for (const line of chunk.split('\n').filter(Boolean))
      transcript.push({ direction: 'runner-to-host', line });
  });
  child.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
  const exited = new Promise<number | null>((resolve) => {
    child.once('exit', (code) => resolve(code));
  });
  const transport = new HarnessTransport({ stdin, stdout });
  return {
    child,
    stderrText: () => Buffer.concat(stderrChunks).toString('utf8'),
    transcript,
    transport,
    exited,
  };
};

export const netGuardNodeArgs = (): string[] => ['--import', pathToFileURL(NETGUARD_MODULE).href];

export const netGuardEnv = (logPath: string, fsWriteAllow: string[]): Record<string, string> => ({
  ORVILO_NETGUARD_LOG: logPath,
  ORVILO_NETGUARD_FS_WRITE_ALLOW: fsWriteAllow.join(':'),
});

export interface NetGuardEntry {
  detail: string;
  kind: 'fs-write' | 'guard' | 'net';
  module: string;
}

export const readNetGuardLog = (logPath: string): NetGuardEntry[] => {
  if (!existsSync(logPath)) return [];
  return readFileSync(logPath, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as NetGuardEntry);
};

export interface RealSupervisorState {
  /** Inputs the host asked the supervisor to launch — env-scrub evidence. */
  launches: IsolatedLaunch[];
  terminatedTrees: string[];
}

export interface RealProcessSupervisor {
  state: RealSupervisorState;
  supervisor: (options: DockerSupervisorOptions) => HostSupervisorPort;
}

export interface RealProcessSupervisorOptions {
  extraEnv?: Record<string, string>;
  nodeArgs?: string[];
  supervisorId: string;
  transcript?: WireFrame[];
}

/**
 * Supervisor double for the no-Docker box. It launches the REAL runner
 * artifact as a plain child process over the REAL launch input the host
 * constructed (executable/args/environment/workspace verbatim — the
 * environment assertion is exact). It then reports the isolation contract:
 * `processes`/`sanitizedEnvironment`/`credentialsExcluded` are real (it owns
 * the tree and passes the scrubbed env through untouched); `filesystem` and
 * `network` are ASSERTED — a plain spawn cannot enforce mount or egress
 * policy; only the container image does. prime-embedded-acceptance.md records
 * this gap; use netGuardNodeArgs for instrumentation-level network evidence.
 */
export const realProcessSupervisor = (
  spec: RealProcessSupervisorOptions,
): RealProcessSupervisor => {
  const state: RealSupervisorState = { launches: [], terminatedTrees: [] };
  let tree:
    | {
        child: ChildProcessWithoutNullStreams;
        exited: Promise<number | null>;
        exitCode: number | null;
        stdin: PassThrough;
        stdout: PassThrough;
      }
    | undefined;

  const supervisor = (options: DockerSupervisorOptions): HostSupervisorPort => ({
    async connect(_treeId: string) {
      if (!tree || tree.exitCode !== null) throw new Error('No live owned tree transport');
      return { stdin: tree.stdin, stdout: tree.stdout };
    },

    async launch(input: IsolatedLaunch): Promise<ControlResult<IsolationEvidence>> {
      state.launches.push(input);
      const child = spawn(input.executable, [...(spec.nodeArgs ?? []), ...input.args], {
        cwd: input.workspace,
        env: { ...input.environment, ...spec.extraEnv },
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const transcript = spec.transcript;
      const stdin = new PassThrough();
      if (transcript) {
        stdin.on('data', (chunk: Buffer) => {
          for (const line of chunk.toString('utf8').split('\n').filter(Boolean))
            transcript.push({ direction: 'host-to-runner', line });
        });
      }
      stdin.pipe(child.stdin);
      stdin.on('close', () => child.stdin.end());
      const stdout = new PassThrough();
      child.stdout.pipe(stdout);
      if (transcript) {
        stdout.on('data', (chunk: Buffer) => {
          for (const line of chunk.toString('utf8').split('\n').filter(Boolean))
            transcript.push({ direction: 'runner-to-host', line });
        });
      }
      const entry = {
        child,
        exited: Promise.resolve<number | null>(0),
        exitCode: null as number | null,
        stdin,
        stdout,
      };
      entry.exited = new Promise<number | null>((resolve) => {
        child.once('exit', (code) => {
          entry.exitCode = code;
          resolve(code);
        });
      });
      child.stderr.on('data', () => {});
      tree = entry;
      const treeId = `real-${randomUUID()}`;
      return {
        ok: true,
        value: {
          credentialsExcluded: true,
          enforced: true,
          filesystem: true, // ASSERTED — a plain spawn cannot enforce mounts; container-only.
          network: true, // ASSERTED — see netGuard tests for instrumentation evidence.
          processes: true,
          sanitizedEnvironment: true,
          supervisorId: spec.supervisorId,
          treeId,
        },
      };
    },

    async recover(): Promise<string | undefined> {
      return undefined;
    },

    async terminate(treeId: string): Promise<ControlResult<QuiescenceProof>> {
      state.terminatedTrees.push(treeId);
      const drained = await options.drainActions(treeId);
      if (drained.pendingActions !== 0)
        return {
          ok: false,
          error: {
            code: 'not_quiescent',
            message: `drainActions reports ${drained.pendingActions} pending`,
            retryable: false,
          },
        };
      if (!tree)
        return {
          ok: false,
          error: { code: 'not_quiescent', message: 'no owned tree', retryable: false },
        };
      if (tree.exitCode === null) {
        tree.stdin.end();
        const code = await Promise.race([
          tree.exited,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 10_000)),
        ]);
        if (code === null) {
          tree.child.kill('SIGKILL');
          await tree.exited;
        }
      }
      const remaining = tree.exitCode === null ? 1 : 0;
      tree = undefined;
      return {
        ok: true,
        value: {
          observedAt: Date.now(),
          pendingActions: 0,
          remainingProcesses: remaining,
          supervisorId: spec.supervisorId,
          treeId,
        },
      };
    },
  });

  return { state, supervisor };
};

export interface Gate {
  promise: Promise<void>;
  release: () => void;
}
export const gate = (): Gate => {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
};

export const waitFor = async (predicate: () => boolean, timeoutMs = 10_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('waitFor timed out');
};

export const directoriesFor = async (
  prefix: string,
): Promise<{
  control: string;
  output: string;
  receipts: string;
  root: string;
  workspace: string;
}> => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), `embedded-acc-${prefix}-`)));
  const [control, output, receipts, workspace] = await Promise.all(
    ['control', 'output', 'receipts', 'workspace'].map(async (name) => {
      const dir = path.join(root, name);
      await mkdir(dir, { recursive: true });
      return dir;
    }),
  );
  return { control, output, receipts, root, workspace };
};

export interface SeenRequest {
  body: string;
  headers: IncomingHttpHeaders;
  method?: string;
  url?: string;
}

export interface StubProvider {
  endpoint: string;
  inferResponsesAborted: () => number;
  seenRequests: SeenRequest[];
  setInferPlan: (plan?: (res: ServerResponse) => Promise<void>) => void;
  stop: () => Promise<void>;
}

export const sseDelta = (delta: string): string =>
  `data: {"id":"c1","object":"chat.completion.chunk","choices":[{"delta":{"content":${JSON.stringify(
    delta,
  )}},"index":0}]}\n\n`;

export const sseUsage = (input: number, output: number): string =>
  `data: {"choices":[],"usage":{"completion_tokens":${output},"prompt_tokens":${input},"total_tokens":${
    input + output
  }}}\n\ndata: [DONE]\n\n`;

const SSE_HEADERS = { 'content-type': 'text/event-stream' };

/**
 * Local stub OpenAI-compatible provider — the ONLY host the suite talks to.
 * Binds 127.0.0.1 on a random port; never forwards anywhere.
 */
export const startStubProvider = async (): Promise<StubProvider> => {
  const seenRequests: SeenRequest[] = [];
  let inferResponsesAborted = 0;
  let inferPlan: ((res: ServerResponse) => Promise<void>) | undefined;

  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      seenRequests.push({
        body: Buffer.concat(chunks).toString('utf8'),
        headers: req.headers,
        method: req.method,
        url: req.url,
      });
      if (req.method === 'GET' && req.url === '/models') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(
          JSON.stringify({
            data: [{ context_length: 32_768, id: 'mock-model-1', max_output_tokens: 8192 }],
          }),
        );
        return;
      }
      if (req.method === 'POST' && req.url === '/chat/completions') {
        // Same abort detector as embeddedBroker.test.ts: the client destroying
        // the request mid-stream surfaces as 'close' before 'finish'.
        res.on('close', () => {
          if (!res.writableFinished) inferResponsesAborted += 1;
        });
        res.writeHead(200, SSE_HEADERS);
        const respond = async () => {
          if (inferPlan) await inferPlan(res);
          else {
            res.write(sseDelta('OK.'));
            res.write(sseUsage(1, 1));
            res.end();
          }
        };
        respond().catch((error) => {
          console.error('stub provider infer plan failed:', error);
          res.destroy();
        });
        return;
      }
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{}');
    });
  });

  // server.close() waits for open connections — abort tests deliberately hold
  // sockets open, so track and kill them on shutdown.
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('stub provider has no port');

  return {
    endpoint: `http://127.0.0.1:${address.port}`,
    inferResponsesAborted: () => inferResponsesAborted,
    seenRequests,
    setInferPlan: (plan) => {
      inferPlan = plan;
    },
    stop: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
};

export const writeTranscript = async (filePath: string, frames: WireFrame[]): Promise<void> => {
  await writeFile(filePath, frames.map((frame) => JSON.stringify(frame)).join('\n') + '\n', 'utf8');
};
