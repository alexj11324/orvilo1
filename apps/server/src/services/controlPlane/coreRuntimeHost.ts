import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';

import type {
  ActionRequest,
  Commitment,
  ControlResult,
  DurableReceipt,
  IsolationEvidence,
  RuntimeEvent,
  RuntimeSession,
} from '@orvilo/agent-execution';
import type {
  DockerSupervisorOptions,
  PrimeRuntimeOptions,
} from '@orvilo/agent-execution/controlPlane/server';
import {
  createActionGateway,
  createFileActionExecutor,
  DockerProcessTreeSupervisor,
  FileDurableReceiptStore,
  PrimeExecutionRuntime,
  PrimeStdioTransport,
  ScopedFileWriter,
} from '@orvilo/agent-execution/controlPlane/server';

import type { HandoffIntent } from '@/database/models/taskExecutionControl';
import { TaskExecutionControlModel } from '@/database/models/taskExecutionControl';
import type { OrviloDatabase } from '@/database/type';

import type { CanonicalCompletionOutcome, CanonicalReceiptMapping } from './canonicalCompletion';
import { CanonicalVerifyCompletion } from './canonicalCompletion';
import type { CanonicalRunBinding } from './canonicalRun';
import { CanonicalRunAuthority } from './canonicalRun';
import { CanonicalSessionSnapshots } from './canonicalSessionSnapshot';

interface HostJournal {
  binding: CanonicalRunBinding;
  containerName: string;
  handoffId?: string;
  isolation?: IsolationEvidence;
  receiptDirectory: string;
  recoveredTreeId?: string;
  session?: RuntimeSession;
  stopping: boolean;
}

export interface CanonicalCoreHostOptions {
  binding: CanonicalRunBinding;
  /** Loaded from trusted server registration; never accepted as completion request data. */
  completionMappings?: CanonicalReceiptMapping[];
  /** Private broker-owned control directory, outside the mounted workspace. */
  controlDirectory: string;
  database: OrviloDatabase;
  docker: Omit<DockerSupervisorOptions, 'drainActions'>;
  /** Explicit host-approved file.sha256 commitments. Empty means no mutations.
   * These are not inferred from runtime claims or treated as task completion evidence. */
  fileCommitments: Commitment[];
  /** A separately approved direct-child output capability, outside the runtime mount. */
  outputDirectory: string;
  /** Stable private receipt namespace shared by successor registrations of this task. */
  receiptDirectory?: string;
  runtimeLeaseMs?: number;
  verifyArtifact: PrimeRuntimeOptions['verifyArtifact'];
}

const failure = (message: string): ControlResult<never> => ({
  ok: false,
  error: { code: 'policy_denied', message, retryable: false },
});

/** Opt-in host composition for a canonically registered, leased run. It does not
 * turn a legacy provisioning lease into runtime ownership or enable legacy runners.
 * All gateway effects hold CanonicalRunAuthority row locks; requestStop waits for
 * them and persists a fence advance before quiescence can be acknowledged. */
export class CanonicalCoreRuntimeHost {
  private readonly runtime: PrimeExecutionRuntime;
  private readonly authority: CanonicalRunAuthority;
  private readonly registration: TaskExecutionControlModel;
  private readonly supervisor: DockerProcessTreeSupervisor;
  private readonly commitments: Map<string, Commitment>;
  private journal: HostJournal;
  private session?: RuntimeSession;
  private starting = false;
  private recovering: boolean;
  private readonly receipts: string;

  private constructor(
    private readonly options: CanonicalCoreHostOptions,
    private readonly writer: ScopedFileWriter,
    journal: HostJournal,
    recovering: boolean,
  ) {
    this.journal = journal;
    this.recovering = recovering;
    this.receipts = options.receiptDirectory ?? path.join(options.controlDirectory, 'receipts');
    this.authority = new CanonicalRunAuthority(options.database);
    this.registration = new TaskExecutionControlModel(
      options.database,
      options.binding.userId,
      options.binding.workspaceId,
    );
    this.commitments = new Map(
      options.fileCommitments.map((commitment) => [commitment.id, structuredClone(commitment)]),
    );
    this.supervisor = new DockerProcessTreeSupervisor({
      ...options.docker,
      containerName: journal.containerName,
      drainActions: (treeId) => this.drainActions(treeId),
    });
    this.runtime = new PrimeExecutionRuntime({
      executable: options.docker.executable,
      home: '/tmp',
      temp: '/tmp',
      runtimeWorkspace: '/workspace',
      verifyArtifact: options.verifyArtifact,
      authorize: async (fence) => {
        if (this.journal.stopping || this.recovering) return failure('Host admission is closed');
        const authorize = this.session
          ? this.authority.withRun.bind(this.authority)
          : this.authority.withRegistration.bind(this.authority);
        const checked = await authorize(this.journal.binding, async (snapshot) => {
          if (
            Object.keys(snapshot.fence).some(
              (key) =>
                snapshot.fence[key as keyof typeof fence] !== fence[key as keyof typeof fence],
            )
          )
            return failure('Runtime fence does not match registered run');
          return { ok: true as const, value: true as const };
        });
        return checked.ok ? checked.value : checked;
      },
      supervisor: {
        launch: async (input) => {
          const result = await this.supervisor.launch(input);
          if (result.ok) {
            this.journal.isolation = result.value;
            try {
              await this.persist();
            } catch {
              await this.supervisor.terminate(result.value.treeId);
              throw new Error('Runtime tree registration could not persist');
            }
          }
          return result;
        },
        terminate: (treeId) => this.supervisor.terminate(treeId),
      },
      connect: async (treeId) => {
        if (treeId !== this.journal.isolation?.treeId) throw new Error('Unregistered runtime tree');
        return new PrimeStdioTransport(await this.supervisor.connect(treeId));
      },
    });
  }

  static async open(input: CanonicalCoreHostOptions) {
    const options = {
      ...input,
      binding: structuredClone(input.binding),
      docker: { ...input.docker },
      fileCommitments: structuredClone(input.fileCommitments),
      completionMappings: structuredClone(input.completionMappings ?? []),
      receiptDirectory: input.receiptDirectory ?? path.join(input.controlDirectory, 'receipts'),
    };
    const { realpath } = await import('node:fs/promises');
    const mounted = await realpath(options.docker.workspace);
    if (
      options.controlDirectory === options.outputDirectory ||
      options.controlDirectory.startsWith(`${options.outputDirectory}/`) ||
      options.outputDirectory.startsWith(`${options.controlDirectory}/`)
    )
      throw new Error('Output must not overlap private control storage');
    if (
      options.receiptDirectory === options.outputDirectory ||
      options.receiptDirectory.startsWith(`${options.outputDirectory}/`) ||
      options.outputDirectory.startsWith(`${options.receiptDirectory}/`)
    )
      throw new Error('Receipt namespace must not overlap output capability');
    for (const directory of [
      options.controlDirectory,
      options.outputDirectory,
      options.receiptDirectory,
    ]) {
      if (
        !path.isAbsolute(directory) ||
        directory === mounted ||
        directory.startsWith(`${mounted}/`)
      )
        throw new Error('Broker directories must be outside runtime mount');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      if ((await realpath(directory)) !== directory)
        throw new Error('Canonical broker directory required');
    }
    let journal: HostJournal = {
      binding: options.binding,
      receiptDirectory: options.receiptDirectory,
      containerName: `orvilo-core-${createHash('sha256')
        .update(
          JSON.stringify([
            options.binding.workspaceId,
            options.binding.taskId,
            options.binding.runtimeRegistrationId,
          ]),
        )
        .digest('hex')}`,
      stopping: false,
    };
    let recovering = false;
    try {
      journal = JSON.parse(
        await readFile(path.join(options.controlDirectory, 'host.json'), 'utf8'),
      );
      if (JSON.stringify(journal.binding) !== JSON.stringify(options.binding))
        throw new Error('Control directory belongs to another canonical run');
      // Recovery uses the committed lineage namespace, including handoff's
      // internally selected shared directory. Never silently fall back to a new store.
      const receipts = journal.receiptDirectory;
      if (
        !receipts ||
        !path.isAbsolute(receipts) ||
        receipts === mounted ||
        receipts.startsWith(`${mounted}/`) ||
        receipts === options.outputDirectory ||
        receipts.startsWith(`${options.outputDirectory}/`) ||
        options.outputDirectory.startsWith(`${receipts}/`) ||
        (input.receiptDirectory !== undefined && input.receiptDirectory !== receipts) ||
        (await realpath(receipts)) !== receipts
      )
        throw new Error('Receipt namespace registration mismatch');
      options.receiptDirectory = receipts;
      recovering = true;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    const writer = await ScopedFileWriter.open(options.outputDirectory);
    const host = new CanonicalCoreRuntimeHost(options, writer, journal, recovering);
    if (!recovering) await host.persist(true);
    try {
      if (!recovering)
        await host.registration.register(options.binding, options.runtimeLeaseMs ?? 60_000);
    } catch (error) {
      await writer.close();
      throw error;
    }
    return host;
  }

  private async persist(exclusive = false) {
    const destination = path.join(this.options.controlDirectory, 'host.json');
    const temporary = exclusive
      ? destination
      : path.join(this.options.controlDirectory, `${randomUUID()}.tmp`);
    const file = await open(temporary, 'wx', 0o600);
    try {
      await file.writeFile(JSON.stringify(this.journal));
      await file.sync();
    } finally {
      await file.close();
    }
    if (!exclusive) await rename(temporary, destination);
    const directory = await open(this.options.controlDirectory, 'r');
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
  }

  /** Read after the asynchronous launch callback has persisted its result. */
  private registeredIsolation(): IsolationEvidence | undefined {
    return this.journal.isolation;
  }

  async start(): Promise<ControlResult<RuntimeSession>> {
    if (
      this.starting ||
      this.session ||
      this.journal.isolation ||
      this.recovering ||
      this.journal.stopping
    )
      return failure('Host already started or requires recovery');
    this.starting = true;
    try {
      const checked = await this.authority.withRegistration(
        this.journal.binding,
        async (snapshot) => snapshot,
      );
      if (!checked.ok) return checked;
      if (checked.value.registrationState !== 'registering' || checked.value.treeId)
        return failure('A process is already registered');
      const result = await this.runtime.start({
        fence: checked.value.fence,
        workspace: this.options.docker.workspace,
      });
      if (result.ok) {
        const isolation = this.registeredIsolation();
        if (!isolation) return failure('Runtime isolation registration unavailable');
        this.journal.session = result.value;
        try {
          await this.persist();
          const identity = {
            treeId: isolation.treeId,
            supervisorId: isolation.supervisorId,
            sessionId: result.value.sessionId,
          };
          if (checked.value.activeHandoffId) {
            const handoff = await this.registration.read(checked.value.activeHandoffId);
            if (!handoff || handoff.phase !== 'transferred')
              throw new Error('Successor handoff changed');
            await this.registration.resume(handoff.id, handoff.revision, identity);
          } else await this.registration.activate(this.journal.binding, identity);
          this.session = result.value;
        } catch {
          // A successful activation can lose its acknowledgement. Re-read the
          // authoritative registration before stopping a correctly registered tree.
          const reconciled = await this.authority.withRun(
            this.journal.binding,
            async (snapshot) => snapshot,
          );
          if (
            reconciled.ok &&
            reconciled.value.treeId === isolation.treeId &&
            reconciled.value.supervisorId === isolation.supervisorId &&
            reconciled.value.sessionId === result.value.sessionId
          ) {
            this.session = result.value;
            return result;
          }
          const stopped = await this.supervisor.terminate(isolation.treeId);
          if (!stopped.ok) return stopped;
          return failure('Runtime activation did not commit; admission remains closed');
        }
      }
      return result;
    } finally {
      this.starting = false;
    }
  }

  async *prompt(text: string): AsyncIterable<RuntimeEvent> {
    if (!this.session) {
      yield {
        type: 'error',
        sessionId: '',
        error: { code: 'policy_denied', message: 'No activated runtime session', retryable: false },
      };
      return;
    }
    yield* this.runtime.prompt(this.session, text);
  }

  async shutdown() {
    return this.session ? this.runtime.shutdown(this.session) : this.recoverStop();
  }

  async execute(request: ActionRequest): Promise<ControlResult<DurableReceipt>> {
    if (!this.session || this.journal.stopping || this.recovering || !this.journal.isolation)
      return failure('No live registered action admission');
    if (!request || request.action?.kind !== 'file.write')
      return failure('Unsupported action request');
    const commitment = this.commitments.get(request.commitmentId);
    if (
      !commitment ||
      commitment.taskId !== this.journal.binding.taskId ||
      request.action.kind !== 'file.write'
    )
      return failure('No approved file commitment');
    const isolation = this.journal.isolation;
    return createActionGateway({
      authority: {
        withAdmission: async (_action, run) => {
          const admitted = await this.authority.withRun(this.journal.binding, async (snapshot) => {
            if (
              this.journal.stopping ||
              !snapshot.allowedActions.includes('file.write') ||
              snapshot.treeId !== isolation.treeId ||
              snapshot.supervisorId !== isolation.supervisorId ||
              snapshot.sessionId !== this.session?.sessionId
            )
              throw new Error('File action is not granted');
            return run({
              fence: snapshot.fence,
              grant: {
                expiresAt: snapshot.grantExpiresAt,
                revoked: false,
                permittedKinds: ['file.write'],
              },
              leaseExpiresAt: snapshot.leaseExpiresAt,
              mutationEnabled: true,
              isolation,
              commitment,
            });
          });
          if (!admitted.ok) throw new Error('Canonical action admission denied');
          return admitted.value;
        },
      },
      executor: createFileActionExecutor(this.writer),
      receipts: new FileDurableReceiptStore(this.receipts),
    }).execute(request);
  }

  /** Supervisor callback is bound to this host's persisted tree, never a caller's tree ID. */
  async drainActions(treeId: string): Promise<{ pendingActions: number }> {
    if ((this.journal.isolation?.treeId ?? this.journal.recoveredTreeId) !== treeId)
      throw new Error('Unregistered runtime tree');
    this.journal.stopping = true;
    await this.persist();
    const binding = this.journal.binding;
    if (this.journal.handoffId) {
      const registered = await this.registration.readControl(binding);
      const control = registered?.control;
      if (
        !control ||
        registered?.epoch !== binding.executionEpoch ||
        control.state !== 'held' ||
        control.activeHandoffId !== this.journal.handoffId ||
        control.ownerId !== binding.runtimeOwnerId ||
        control.registrationId !== binding.runtimeRegistrationId ||
        control.leaseId !== binding.runtimeLeaseId ||
        control.treeId !== treeId ||
        control.supervisorId !== this.options.docker.supervisorId
      )
        throw new Error('Handoff source admission is not durably held');
    } else {
      let stopped = false;
      for (let attempt = 0; attempt < 50; attempt++) {
        try {
          await this.registration.stop(binding);
          stopped = true;
          break;
        } catch {
          // NOWAIT canonical locks may be held by an already admitted effect.
          // The local latch is closed and no zero-pending proof is returned yet.
          if (attempt < 49) await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }
      if (!stopped) throw new Error('Exact process stop did not commit');
    }
    let directories: string[];
    try {
      directories = await readdir(this.receipts);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return { pendingActions: 0 };
      throw error;
    }
    let pendingActions = 0;
    for (const directory of directories) {
      if (!/^[a-f0-9]{64}$/.test(directory)) throw new Error('Unexpected receipt entry');
      const receipt: DurableReceipt = JSON.parse(
        await readFile(path.join(this.receipts, directory, 'receipt.json'), 'utf8'),
      );
      if (!['verified', 'failed'].includes(receipt.status)) pendingActions++;
    }
    return { pendingActions };
  }

  /** Trusted server orchestration only. Recover phases from the canonical history;
   * an already registered successor is reported without claiming ACP reconnect. */
  async handoffTo(
    intent: HandoffIntent,
    successorOptions: Omit<CanonicalCoreHostOptions, 'binding' | 'database'>,
  ): Promise<
    ControlResult<{
      binding: CanonicalRunBinding;
      sessionId: string;
      transportReady: boolean;
      host?: CanonicalCoreRuntimeHost;
      session?: RuntimeSession;
    }>
  > {
    let successor: CanonicalCoreRuntimeHost | undefined;
    try {
      let record = await this.registration.read(intent.id);
      if (!record) record = await this.registration.beginHandoff(this.journal.binding, intent);
      const r = record.record;
      if (
        r.source.registrationId !== this.journal.binding.runtimeRegistrationId ||
        r.source.ownerId !== this.journal.binding.runtimeOwnerId ||
        r.source.leaseId !== this.journal.binding.runtimeLeaseId ||
        r.sourceEpoch !== this.journal.binding.executionEpoch ||
        r.successorOwnerId !== intent.successorOwnerId ||
        r.successorRegistrationId !== intent.successorRegistrationId ||
        r.successorLeaseId !== intent.successorLeaseId ||
        r.leaseMs !== intent.leaseMs
      )
        return failure('Handoff intent conflicts with durable registration');
      if (record.phase === 'prepared')
        record = await this.registration.advance(record.id, record.revision, 'quiescing');
      if (record.phase === 'quiescing') {
        const quiescent = await this.quiesceForHandoff(record.id);
        if (!quiescent.ok) return quiescent;
        record = await this.registration.advance(
          record.id,
          record.revision,
          'quiescent',
          quiescent.value,
        );
      }
      if (record.phase === 'quiescent') {
        // A stored report alone cannot establish that the source is still stopped.
        const fresh = await this.quiesceForHandoff(record.id);
        if (!fresh.ok) return fresh;
        record = (await this.registration.transfer(record.id, record.revision)).record;
      }
      const binding: CanonicalRunBinding = {
        ...this.journal.binding,
        executionEpoch: r.sourceEpoch + 1,
        runtimeOwnerId: r.successorOwnerId,
        runtimeRegistrationId: r.successorRegistrationId,
        runtimeLeaseId: r.successorLeaseId,
      };
      if (record.phase === 'resumed') {
        const registered = await this.registration.readControl(binding);
        const control = registered?.control;
        if (
          !control ||
          control.state !== 'running' ||
          control.registrationId !== binding.runtimeRegistrationId ||
          control.ownerId !== binding.runtimeOwnerId ||
          control.leaseId !== binding.runtimeLeaseId ||
          !control.sessionId ||
          registered?.epoch !== binding.executionEpoch
        )
          return failure('Successor registration changed');
        const current = await this.authority.withRun(binding, async (snapshot) => snapshot);
        if (
          !current.ok ||
          current.value.treeId !== control.treeId ||
          current.value.sessionId !== control.sessionId
        )
          return failure('Successor authority is no longer live');
        return {
          ok: true,
          value: { binding, sessionId: control.sessionId, transportReady: false },
        };
      }
      if (record.phase !== 'transferred') return failure('Handoff has no transferable successor');
      successor = await CanonicalCoreRuntimeHost.open({
        ...successorOptions,
        receiptDirectory: this.receipts,
        binding,
        database: this.options.database,
      });
      const started = await successor.start();
      if (!started.ok) {
        // Never launch a replacement for a journaled but unacknowledged successor.
        // Exact-name stop recovery is explicit; ACP transport reattachment is not claimed.
        if (successor.journal.isolation) {
          const stopped = await successor.recoverStop();
          if (!stopped.ok) {
            await successor.close();
            return stopped;
          }
        }
        await successor.close();
        return started;
      }
      return {
        ok: true,
        value: {
          binding,
          sessionId: started.value.sessionId,
          transportReady: true,
          host: successor,
          session: started.value,
        },
      };
    } catch {
      if (successor?.journal.isolation) {
        const stopped = await successor.recoverStop();
        await successor.close();
        if (!stopped.ok) return stopped;
      } else await successor?.close();
      return failure('Handoff admission or recovery is unavailable');
    }
  }

  /** Stops only the held source tree; it does not cancel the task dispatch. */
  async quiesceForHandoff(handoffId: string) {
    const source = await this.registration.readControl(this.journal.binding);
    if (
      !source?.control ||
      source.control.state !== 'held' ||
      source.control.activeHandoffId !== handoffId ||
      !this.journal.isolation ||
      source.control.treeId !== this.journal.isolation.treeId
    )
      return failure('Source handoff hold unavailable');
    this.journal.handoffId = handoffId;
    this.journal.stopping = true;
    await this.persist();
    return this.supervisor.terminate(this.journal.isolation.treeId);
  }

  /** Read every receipt: unmapped ambiguous effects cannot disappear from recovery. */
  private async loadReceipts(): Promise<DurableReceipt[]> {
    let directories: string[];
    try {
      directories = await readdir(this.receipts);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    }
    const receipts: DurableReceipt[] = [];
    const identities = new Set<string>();
    for (const directory of directories) {
      if (!/^[a-f0-9]{64}$/.test(directory)) throw new Error('Unexpected receipt entry');
      const receipt: DurableReceipt = JSON.parse(
        await readFile(path.join(this.receipts, directory, 'receipt.json'), 'utf8'),
      );
      if (identities.has(receipt.id)) throw new Error('Ambiguous durable receipt identity');
      identities.add(receipt.id);
      receipts.push(receipt);
    }
    return receipts;
  }

  /** Host-only observation. Prime history contributes an optional hash, never authority. */
  captureRecoverySnapshot(historyContentHash?: string) {
    return new CanonicalSessionSnapshots(this.options.database).capture(this.journal.binding, {
      commitments: [...this.commitments.values()],
      completionMappings: this.options.completionMappings ?? [],
      loadReceipts: () => this.loadReceipts(),
      historyContentHash,
    });
  }

  /** Metadata admission is separate from restarting execution. File receipts have no
   * safe takeover adapter: incomplete work remains blocked, including unmapped work. */
  async inspectRecoverySnapshot(snapshotId: string, historyContentHash?: string) {
    const recovered = await new CanonicalSessionSnapshots(this.options.database).recover(
      this.journal.binding,
      snapshotId,
      {
        commitments: [...this.commitments.values()],
        completionMappings: this.options.completionMappings ?? [],
        loadReceipts: () => this.loadReceipts(),
        historyContentHash,
      },
    );
    if (!recovered.ok) return recovered;
    return {
      ok: true as const,
      value: {
        snapshot: recovered.value,
        executionResume: 'unsupported' as const,
        blockedReceiptIds: recovered.value.authority.receipts
          .filter((receipt) => receipt.status !== 'verified')
          .map((receipt) => receipt.id),
      },
    };
  }

  /** Even a valid authority snapshot cannot synthesize ACP session/load or restore
   * a kernel/partially applied effect. Start a separately authorized fresh session. */
  async resumeFromSnapshot(
    snapshotId: string,
    historyContentHash?: string,
  ): Promise<ControlResult<never>> {
    const inspected = await this.inspectRecoverySnapshot(snapshotId, historyContentHash);
    if (!inspected.ok) return inspected;
    if (inspected.value.blockedReceiptIds.length) {
      return {
        ok: false,
        error: {
          code: 'outcome_unknown',
          message: 'Unreconciled durable receipts block execution recovery',
          retryable: false,
        },
      };
    }
    return {
      ok: false,
      error: {
        code: 'unsupported_capability',
        message:
          'Pinned Prime ACP cannot resume execution from an Orvilo snapshot; use a newly authorized session',
        retryable: false,
      },
    };
  }

  /** Explicit trusted completion request. A runtime end_turn never calls this.
   * Receipt IDs are looked up only inside this host's private durable namespace. */
  async reconcileCompletion(): Promise<CanonicalCompletionOutcome> {
    const mappings = this.options.completionMappings;
    if (!mappings?.length) return { state: 'denied', reason: 'receipt_mapping_unavailable' };
    try {
      return await new CanonicalVerifyCompletion(this.options.database).reconcile(
        this.journal.binding,
        {
          mappings: structuredClone(mappings),
          loadReceipt: async (id) =>
            (await this.loadReceipts()).find((receipt) => receipt.id === id),
        },
      );
    } catch {
      return { state: 'denied', reason: 'trusted_completion_unavailable' };
    }
  }

  async recoverStop() {
    let treeId = this.journal.isolation?.treeId ?? this.journal.recoveredTreeId;
    if (!treeId) {
      treeId = await this.supervisor.recover();
      if (!treeId) return failure('No owned container found for persisted launch intent');
      // Recovery establishes only immutable ownership identity, never isolation evidence
      // sufficient to reopen mutations. The host remains in recovery-only mode.
      this.journal.recoveredTreeId = treeId;
      this.journal.stopping = true;
      await this.persist();
    }
    return this.supervisor.terminate(treeId);
  }

  async close() {
    // Closing the writer alone never constitutes tree quiescence.
    await this.writer.close();
  }
}
