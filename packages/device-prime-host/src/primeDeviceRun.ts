/**
 * Prime run on a resolved Device — the device-side half of work package B.
 *
 * Lifecycle inside this host:
 * 1. Verify the shipped runner artifact against the descriptor's manifest pin
 *    (sha256 + bytes + upstream commit/version/license) BEFORE spawn, and
 *    cross-check the pin the runner echoes at `harness.init` — a connected
 *    heartbeat never proves runner availability.
 * 2. Spawn `executable <artifact> --operation-id <operationId>` in its own
 *    process group (`detached`) at the device-resolved workspace. The
 *    operation id rides argv so the daemon's foreign-pid kill check
 *    (`readLeaderCommandLine().includes(operationId)`) stays truthful.
 * 3. Drive the EXISTING NDJSON harness protocol over stdio
 *    (HarnessTransport) — this is not ACP. The runner's `broker.infer`
 *    reverse requests are bridged to the control-side `/prime-broker`
 *    surface under the bound operation credential.
 * 4. Bounded device-side lease: `renewLease()` re-arms
 *    `descriptor.lease.ttlMs` (the daemon calls it on each control-side
 *    liveness signal). A lapsed lease stops new side-effects — the host
 *    aborts the session and kills the process group rather than running
 *    uncontrolled.
 * 5. Activation: after init the host POSTs the launch proof (sessionId,
 *    real tree identity, locally-verified artifact digest) to
 *    `/prime-broker/activate`; the control side will not serve `infer` until
 *    that lands.
 *
 * Isolation is reported honestly: v1 executes the runner in a dedicated
 * process group owned by the device host (`treeId = device-pg-<pgid>`); it
 * does NOT claim container isolation it did not verify.
 */
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { spawn } from 'node:child_process';

import type { ControlError, ControlResult } from '@orvilo/agent-execution/controlPlane/contracts';
import { CONTROL_PLANE_VERSION } from '@orvilo/agent-execution/controlPlane/contracts';
import type {
  HarnessPromptResult,
  HarnessSessionEvent,
} from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import {
  HARNESS_ABORT_METHOD,
  HARNESS_EVENT_NOTIFICATION,
  HARNESS_INIT_METHOD,
  HARNESS_PROMPT_METHOD,
  HARNESS_PROTOCOL_VERSION,
  isHarnessEventParams,
  isHarnessInitAck,
  isHarnessPromptResult,
} from '@orvilo/agent-execution/controlPlane/harnessProtocol';
import { HarnessTransport } from '@orvilo/agent-execution/controlPlane/harnessTransport';
import {
  type EmbeddedArtifactManifest,
  embeddedArtifactVerifier,
  PRIME_EMBEDDED_PIN,
} from '@orvilo/agent-execution/controlPlane/primeEmbeddedArtifact';
import type { PrimeRunDescriptor } from '@orvilo/device-gateway-client';

import {
  type BrokerBridgeOptions,
  createBrokerReverseHandler,
  type PrimeDeviceHostLog,
} from './brokerBridge';

/** Same unbounded prompt window as the embedded host — a run can stream for
 * many minutes; cancel/abort is the real bound, not a socket timeout. */
const PROMPT_TIMEOUT_MS = 24 * 60 * 60 * 1000;
const INIT_TIMEOUT_MS = 30_000;
const LEASE_CHECK_MS = 10_000;

const failure = (code: ControlError['code'], message: string): ControlResult<never> => ({
  error: { code, message, retryable: false },
  ok: false,
});

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export interface PrimeDeviceRunActivation {
  artifact: {
    bytes: number;
    commit: string;
    license: string;
    sha256: string;
    version: string;
  };
  sessionId: string;
  supervisorId: string;
  treeId: string;
}

export interface PrimeDeviceRunOptions {
  /** Device-resolved path to the shipped `runner.mjs` bundle. */
  artifact: string;
  /** Control-side broker base: `${serverUrl}/api/agent/prime-broker`. */
  brokerUrl: string;
  /** The `prime` descriptor from `agent_run_request`. */
  descriptor: PrimeRunDescriptor;
  /** Extra env for the runner process (merged over the minimal base). */
  env?: Record<string, string>;
  /** Device-supplied runtime executable (node / bun / ELECTRON_RUN_AS_NODE). */
  executable: string;
  fetchImpl?: typeof fetch;
  log?: PrimeDeviceHostLog;
  /** Operation id — rides argv for the foreign-pid kill check. */
  operationId: string;
  /**
   * Persisted upstream session id to reopen under `<stateDir>/sessions/` —
   * the restart-resume path: a rebuilt runner reopens the dead session's
   * jsonl and the init ack echoes the same sessionId when it did. Absent or
   * unmatched → fresh session (the host reads the ack as the truth oracle).
   */
  resumeSessionId?: string;
  /** Test seam — overrides process spawn. */
  spawnImpl?: typeof spawn;
  /** Device-supplied runner state dir — replaces the runner's legacy /tmp/agent default. */
  stateDir: string;
  /** Runner-visible working directory (device-resolved cwd). */
  workspace: string;
}

export interface PrimeDeviceRun {
  /** Graceful stop: `session.abort` + transport close. */
  abort: () => Promise<void>;
  /** Post-init proof — the same payload POSTed to `/activate`. */
  activation: PrimeDeviceRunActivation;
  /** The runner child — process-group leader. Registered in the daemon's
   * run registry so `cancel` signals it exactly like a wrapper CLI. */
  child: ChildProcess;
  /** The run's stdio event stream is closed (runner exited or transport
   * torn down) — a closed run can never accept another prompt. */
  readonly closed: boolean;
  /** Harness session events in arrival order (text/usage/tool-violation/error). */
  events: AsyncIterable<HarnessSessionEvent>;
  /** Hard stop: kill the process group + close the transport. */
  kill: () => Promise<void>;
  /** Resolves when the side-effect lease lapses; the run is already dead. */
  leaseExpired: Promise<void>;
  /** True once the bounded lease lapsed — lets the driver report a
   * lease-kill honestly instead of a generic runner exit. */
  readonly leaseLapsed: boolean;
  /** Events pushed by the runner but not yet consumed by an `events`
   * iterator — a driver draining after prompt completion waits for 0. */
  pendingEvents: () => number;
  /** `session.prompt` — resolves with the runner's stop result. */
  prompt: (text: string) => Promise<ControlResult<HarnessPromptResult>>;
  /** Re-POST the launch proof for a NEW operation resuming this session —
   * the server records activation evidence per operation, so a resumed turn
   * must re-activate under its own bound credential (same sessionId). */
  reactivate: (credential: string) => Promise<ControlResult<void>>;
  /** Re-arm the bounded side-effect lease (control-side liveness signal). */
  renewLease: () => void;
}

const pinOf = (descriptor: PrimeRunDescriptor) => ({
  commit: descriptor.artifact.commit,
  license: descriptor.artifact.license,
  version: descriptor.artifact.version,
});

const pinMatches = (
  expected: { commit: string; license: string; version: string },
  actual: { commit: string; license: string; version: string },
): boolean =>
  expected.commit === actual.commit &&
  expected.version === actual.version &&
  expected.license === actual.license;

/**
 * Open a Prime run on this device. Fails closed: any step that cannot
 * establish truthful evidence (unreadable artifact, digest mismatch, bad
 * init ack, refused activation) kills the spawned group and returns the
 * error — the device never reports a run it cannot stand behind.
 */
export const openPrimeDeviceRun = async (
  options: PrimeDeviceRunOptions,
): Promise<ControlResult<PrimeDeviceRun>> => {
  const log = options.log ?? console;
  const { descriptor } = options;
  const fetchImpl = options.fetchImpl ?? fetch;

  const manifest: EmbeddedArtifactManifest = {
    artifact: 'runner.mjs',
    bytes: descriptor.artifact.bytes,
    prime: {
      commit: descriptor.artifact.commit,
      license: descriptor.artifact.license,
      version: descriptor.artifact.version,
    },
    schemaVersion: 1,
    sha256: descriptor.artifact.sha256,
  };
  // The host-enforced upstream pin is the pinned literal, never the
  // descriptor's self-report — a descriptor carrying drifted provenance fails
  // here before a byte of the artifact is trusted.
  const verified = await embeddedArtifactVerifier(manifest)(options.artifact, PRIME_EMBEDDED_PIN);
  if (!verified.ok)
    return failure(
      verified.error?.code ?? 'policy_denied',
      verified.error?.message ?? 'Runner artifact verification failed',
    );

  // Normalize the spawn seam to ONE signature — `typeof spawn` is an overload
  // set and resolvers differ on which member a `{stdio:'pipe'}` options literal
  // matches (repo-wide tsgo read `child` as `never` where scoped tsc passed).
  const spawnImpl: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => ChildProcess = options.spawnImpl ?? spawn;
  // `ProcessEnv` is augmented with required keys by packages/env for typed
  // `process.env` reads — a deliberately minimal child env can't satisfy it
  // structurally, so this uses the repo's `as NodeJS.ProcessEnv` convention.
  const env = {
    HOME: options.stateDir,
    PATH: process.env.PATH ?? '',
    TMPDIR: options.stateDir,
    ...options.env,
  } as unknown as NodeJS.ProcessEnv;
  const child = spawnImpl(
    options.executable,
    [options.artifact, '--operation-id', options.operationId],
    {
      cwd: options.workspace,
      detached: true,
      env,
      stdio: 'pipe',
    },
  );
  if (!child.stdin || !child.stdout)
    return failure('policy_denied', 'Device runner spawn produced no stdio pipes');
  child.stderr?.setEncoding('utf8');
  child.stderr?.on('data', (chunk: string) =>
    log.error('prime-device-host: runner stderr: %s', chunk.trimEnd()),
  );

  const transport = new HarnessTransport({ stdin: child.stdin, stdout: child.stdout });
  const killGroup = (): void => {
    try {
      if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
      else child.kill('SIGKILL');
    } catch {
      try {
        child.kill('SIGKILL');
      } catch {
        // Already dead.
      }
    }
  };
  const teardown = (): void => {
    killGroup();
    transport.close();
  };

  let sessionId = '';

  // Bounded lease: lapse → abort + kill. The daemon renews on each
  // control-side liveness signal; silence stops new side-effects.
  let leaseExpiresAt = Date.now() + descriptor.lease.ttlMs;
  let resolveLeaseExpired!: () => void;
  const leaseExpired = new Promise<void>((resolve) => {
    resolveLeaseExpired = resolve;
  });
  let leaseLapsed = false;
  const leaseTimer = setInterval(() => {
    if (Date.now() < leaseExpiresAt) return;
    log.error(
      'prime-device-host: device lease lapsed for op=%s — stopping side-effects',
      options.operationId,
    );
    leaseLapsed = true;
    void (async () => {
      try {
        await transport.request(HARNESS_ABORT_METHOD, { sessionId }, { timeoutMs: 5_000 });
      } catch {
        // Runner unreachable — the group kill below still settles it.
      }
      teardown();
      resolveLeaseExpired();
    })();
  }, LEASE_CHECK_MS);
  leaseTimer.unref?.();

  // Event queue — AsyncIterable over `harness.event` notifications.
  const eventQueue: HarnessSessionEvent[] = [];
  const eventWaiters: Array<() => void> = [];
  let eventStreamClosed = false;
  const pushEvent = (event: HarnessSessionEvent): void => {
    if (eventStreamClosed) return;
    eventQueue.push(event);
    for (const wake of eventWaiters.splice(0)) wake();
  };
  transport.subscribe(({ method, params }) => {
    if (method !== HARNESS_EVENT_NOTIFICATION || !isHarnessEventParams(params)) return;
    pushEvent(params.event);
  });
  child.once('exit', () => {
    eventStreamClosed = true;
    for (const wake of eventWaiters.splice(0)) wake();
    clearInterval(leaseTimer);
    transport.close();
  });

  let ack: unknown;
  try {
    ack = await transport.request(
      HARNESS_INIT_METHOD,
      {
        controlPlaneVersion: CONTROL_PLANE_VERSION,
        model: descriptor.model,
        pin: pinOf(descriptor),
        protocolVersion: HARNESS_PROTOCOL_VERSION,
        resumeSessionId: options.resumeSessionId,
        stateDir: options.stateDir,
        workspace: options.workspace,
      },
      { timeoutMs: INIT_TIMEOUT_MS },
    );
  } catch (error) {
    teardown();
    clearInterval(leaseTimer);
    return failure('policy_denied', `Device runner init failed: ${errorMessage(error)}`);
  }
  if (!isHarnessInitAck(ack)) {
    teardown();
    clearInterval(leaseTimer);
    return failure('policy_denied', 'Device runner init ack is invalid');
  }
  if (!pinMatches(pinOf(descriptor), ack.pin)) {
    teardown();
    clearInterval(leaseTimer);
    return failure('policy_denied', 'Device runner pin echo does not match the descriptor');
  }
  sessionId = ack.sessionId;

  // The bridge answers runner-issued broker.* requests; a runner can only
  // emit them once a session exists, so the handler installs after init with
  // the real sessionId as the per-request fallback. The credential holder is
  // read per-pump so `reactivate` can rotate it to the resuming operation's
  // own bound credential — the descriptor's dies with its operation.
  const brokerBridgeOptions: BrokerBridgeOptions = {
    credential: descriptor.broker.credential,
    endpoint: options.brokerUrl.replace(/\/$/, ''),
    fetchImpl,
    log,
    sendEvent: (requestId, event) => {
      transport.notify('broker.event', { event, requestId });
    },
    sessionId: ack.sessionId,
  };
  const brokerHandler = createBrokerReverseHandler(brokerBridgeOptions);
  transport.setReverseHandler((method, params) => brokerHandler(method, params));

  const activation: PrimeDeviceRunActivation = {
    artifact: { ...descriptor.artifact },
    sessionId,
    supervisorId: 'orvilo-device-prime-host',
    treeId: `device-pg-${child.pid ?? 'unknown'}`,
  };

  const postActivation = async (credential: string): Promise<ControlResult<void>> => {
    try {
      const response = await fetchImpl(`${options.brokerUrl.replace(/\/$/, '')}/activate`, {
        body: JSON.stringify({
          artifact: activation.artifact,
          runtime: { supervisorId: activation.supervisorId, treeId: activation.treeId },
          sessionId: activation.sessionId,
        }),
        headers: {
          'authorization': `Bearer ${credential}`,
          'content-type': 'application/json',
        },
        method: 'POST',
      });
      if (!response.ok)
        return failure('policy_denied', `Device run activation refused (HTTP ${response.status})`);
    } catch (error) {
      return failure('policy_denied', `Device run activation failed: ${errorMessage(error)}`);
    }
    return { ok: true, value: undefined };
  };

  const initialActivation = await postActivation(descriptor.broker.credential);
  if (!initialActivation.ok) {
    teardown();
    clearInterval(leaseTimer);
    return initialActivation;
  }

  const events: AsyncIterable<HarnessSessionEvent> = {
    [Symbol.asyncIterator]() {
      return {
        next: async (): Promise<IteratorResult<HarnessSessionEvent>> => {
          for (;;) {
            const event = eventQueue.shift();
            if (event !== undefined) return { done: false, value: event };
            if (eventStreamClosed) return { done: true, value: undefined };
            await new Promise<void>((resolve) => {
              eventWaiters.push(resolve);
            });
          }
        },
      };
    },
  };

  const run: PrimeDeviceRun = {
    activation,
    child,
    leaseExpired,
    events,
    get closed() {
      return eventStreamClosed;
    },
    get leaseLapsed() {
      return leaseLapsed;
    },
    pendingEvents: () => eventQueue.length,
    reactivate: async (credential) => {
      const activated = await postActivation(credential);
      if (!activated.ok) return activated;
      // The session outlives the original operation — broker.infer calls from
      // here on must carry the NEW operation's bound credential.
      brokerBridgeOptions.credential = credential;
      return activated;
    },
    prompt: async (text) => {
      try {
        const result = await transport.request(
          HARNESS_PROMPT_METHOD,
          { sessionId, text },
          { timeoutMs: PROMPT_TIMEOUT_MS },
        );
        if (!isHarnessPromptResult(result))
          return failure('policy_denied', 'Device runner prompt result is invalid');
        return { ok: true, value: result };
      } catch (error) {
        return failure('policy_denied', `Device runner prompt failed: ${errorMessage(error)}`);
      }
    },
    abort: async () => {
      try {
        await transport.request(HARNESS_ABORT_METHOD, { sessionId }, { timeoutMs: 10_000 });
      } catch {
        // Runner unreachable — transport close still settles the host side.
      }
      transport.close();
      killGroup();
    },
    kill: async () => {
      clearInterval(leaseTimer);
      teardown();
    },
    renewLease: () => {
      leaseExpiresAt = Date.now() + descriptor.lease.ttlMs;
    },
  };

  log.log(
    'prime-device-host: run activated op=%s session=%s tree=%s',
    options.operationId,
    activation.sessionId,
    activation.treeId,
  );
  return { ok: true, value: run };
};
