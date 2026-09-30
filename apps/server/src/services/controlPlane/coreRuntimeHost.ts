import { randomUUID } from 'node:crypto';
import { mkdir, open, readdir, readFile, rename } from 'node:fs/promises';
import path from 'node:path';

import type {
  ActionRequest,
  Commitment,
  ControlResult,
  DurableReceipt,
  IsolationEvidence,
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

import { TaskDispatchModel } from '@/database/models/taskDispatch';
import type { OrviloDatabase } from '@/database/type';

import type { CanonicalCompletionOutcome, CanonicalReceiptMapping } from './canonicalCompletion';
import { CanonicalVerifyCompletion } from './canonicalCompletion';
import type { CanonicalRunBinding } from './canonicalRun';
import { CanonicalRunAuthority } from './canonicalRun';

interface HostJournal {
  binding: CanonicalRunBinding;
  containerName: string;
  isolation?: IsolationEvidence;
  recoveredTreeId?: string;
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
  readonly runtime: PrimeExecutionRuntime;
  private readonly authority: CanonicalRunAuthority;
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
    this.receipts = path.join(options.controlDirectory, 'receipts');
    this.authority = new CanonicalRunAuthority(options.database);
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
        const checked = await this.authority.withRun(this.journal.binding, async (snapshot) => {
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
    };
    const { realpath } = await import('node:fs/promises');
    const mounted = await realpath(options.docker.workspace);
    if (
      options.controlDirectory === options.outputDirectory ||
      options.controlDirectory.startsWith(`${options.outputDirectory}/`) ||
      options.outputDirectory.startsWith(`${options.controlDirectory}/`)
    )
      throw new Error('Output must not overlap private control storage');
    for (const directory of [options.controlDirectory, options.outputDirectory]) {
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
      containerName: `orvilo-core-${randomUUID()}`,
      stopping: false,
    };
    let recovering = false;
    try {
      journal = JSON.parse(
        await readFile(path.join(options.controlDirectory, 'host.json'), 'utf8'),
      );
      if (JSON.stringify(journal.binding) !== JSON.stringify(options.binding))
        throw new Error('Control directory belongs to another canonical run');
      recovering = true;
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    const writer = await ScopedFileWriter.open(options.outputDirectory);
    const host = new CanonicalCoreRuntimeHost(options, writer, journal, recovering);
    if (!recovering) await host.persist(true);
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
      const checked = await this.authority.withRun(
        this.journal.binding,
        async (snapshot) => snapshot.fence,
      );
      if (!checked.ok) return checked;
      const result = await this.runtime.start({
        fence: checked.value,
        workspace: this.options.docker.workspace,
      });
      if (result.ok) this.session = result.value;
      return result;
    } finally {
      this.starting = false;
    }
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
            if (this.journal.stopping || !snapshot.allowedActions.includes('file.write'))
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
    const stopped = await new TaskDispatchModel(
      this.options.database,
      binding.workspaceId,
    ).requestStop({
      dispatchId: binding.dispatchId,
      fence: binding.dispatchFence,
      generation: binding.generation,
      operationId: binding.operationId,
      reason: 'core_runtime_stop',
    });
    if (!stopped) throw new Error('Canonical stop intent could not be established');
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
          loadReceipt: async (id) => {
            let directories: string[];
            try {
              directories = await readdir(this.receipts);
            } catch (error) {
              if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
                return undefined;
              throw error;
            }
            let found: DurableReceipt | undefined;
            for (const directory of directories) {
              if (!/^[a-f0-9]{64}$/.test(directory)) throw new Error('Unexpected receipt entry');
              const receipt: DurableReceipt = JSON.parse(
                await readFile(path.join(this.receipts, directory, 'receipt.json'), 'utf8'),
              );
              if (receipt.id === id) {
                if (found) throw new Error('Ambiguous durable receipt identity');
                found = receipt;
              }
            }
            return found;
          },
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
