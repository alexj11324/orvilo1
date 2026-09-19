import type { ChildProcess } from 'node:child_process';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { access, appendFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  ClaudeCodeQuotaSnapshot,
  CodexQuotaSnapshot,
  CodexRateLimitResetResult,
  HeterogeneousAgentSessionError,
  HeterogeneousCliAgentType,
} from '@orvilo/electron-client-ipc';
import { HeterogeneousAgentSessionErrorCode } from '@orvilo/electron-client-ipc/types/heterogeneous-agent';
import type { HeterogeneousProviderBindingReference } from '@orvilo/heterogeneous-agents';
import {
  buildHeterogeneousAgentAuthRequiredError,
  buildHeterogeneousAgentCliNotFoundError,
  getHeterogeneousAgentConfigOrThrow,
  isHeterogeneousAgentAuthRequired,
  isServerDefaultHeterogeneousAgentType,
  resolveHeterogeneousAgentCommand,
} from '@orvilo/heterogeneous-agents';
import type { AskUserBridgeOptions } from '@orvilo/heterogeneous-agents/askUser';
import { AskUserBridge } from '@orvilo/heterogeneous-agents/askUser';
import type {
  McpToolResult,
  OrviloBuiltinMcpServer,
} from '@orvilo/heterogeneous-agents/builtinMcp';
import { listHeterogeneousAgentModels } from '@orvilo/heterogeneous-agents/models';
import type {
  HeteroExecImageRef,
  HeterogeneousAgentCancellationResult,
  HeterogeneousAgentCancellationSignal,
} from '@orvilo/heterogeneous-agents/protocol';
import {
  buildHeteroExecStdinPayload,
  buildHeterogeneousPrompt,
  HETERO_EXEC_INHERIT_PROCESS_GROUP_ENV,
} from '@orvilo/heterogeneous-agents/protocol';
import {
  CLAUDE_CODE_QUOTA_FRESH_MS,
  createQuotaCacheKey,
  fetchClaudeCodeQuota,
  QuotaSnapshotCache,
  readClaudeCodeIdentity,
} from '@orvilo/heterogeneous-agents/quota-sampler';
import { isLoginShellTimeoutStatus } from '@orvilo/heterogeneous-agents/resolveCliCommand';
import {
  ACP_RUNTIME_AGENT_TYPES,
  type AcpAgentRuntimeSpec,
  AcpRpcResponseError,
  type AcpSpawnTarget,
  buildCursorAcpArgs,
  buildCursorAcpPrompt,
  buildDevinAcpArgs,
  buildDevinAcpPrompt,
  buildDroidAcpArgs,
  buildDroidAcpPrompt,
  buildGrokAcpArgs,
  buildGrokAcpPrompt,
  buildStandardAcpArgs,
  buildStandardAcpPrompt,
  buildTraeAcpArgs,
  buildTraeAcpPrompt,
  createFileStoreImageUploader,
  createStandardAcpSession,
  CursorAcpSession,
  DevinAcpSession,
  DroidAcpSession,
  ensureClaudeCodeResumeTranscript,
  extractStandardAcpSelectors,
  getAcpAgentRuntime,
  GrokAcpSession,
  type HeterogeneousAgentRuntimeStatus,
  isCursorAcpSessionNotFoundError,
  isDevinAcpSessionNotFoundError,
  isDroidAcpSessionNotFoundError,
  isStandardAcpSessionNotFoundError,
  readCodexSessionModel,
  resolveAcpSpawnTarget,
  type StandardAcpSession,
  TraeAcpSession,
} from '@orvilo/heterogeneous-agents/spawn';
import {
  describeUnusableWorkingDirectory,
  isSpawnableDirectory,
  resolveHeteroSpawnCwd,
} from '@orvilo/heterogeneous-agents/workingDirectory';
import type {
  AcpBuiltinToolSpec,
  BuiltinHeterogeneousAgentType,
  HeterogeneousAgentModelCatalog,
  HeterogeneousServerDefaultApiConfig,
  HeteroSessionImportMessage,
  ListHeterogeneousAgentModelsParams,
  OrviloEngineKind,
} from '@orvilo/types';
import { resolveOrviloCliAgentType, resolveOrviloEngine } from '@orvilo/types';
import { sleep } from '@orvilo/utils/sleep';
import { app as electronApp, BrowserWindow } from 'electron';
import { isPlainObject } from 'es-toolkit';
import semver from 'semver';

import { HETERO_AGENT_FILES_DIR, HETERO_AGENT_TRACING_DIR } from '@/const/heteroAgent';
import type { App } from '@/core/App';
import { detectHeterogeneousCliCommand } from '@/modules/binaries';
import { resolveCliScript } from '@/modules/cliEmbedding';
import { getHeterogeneousAgentDriver } from '@/modules/heterogeneousAgent';
import {
  consumeCodexRateLimitResetCredit as consumeCodexRateLimitResetCreditRequest,
  fetchCodexQuota,
} from '@/modules/heterogeneousAgent/codexQuota';
import {
  createLambdaFileStorePort,
  type RemoteServerAuth,
} from '@/modules/heterogeneousAgent/fileStorePort';
import type { HostedProviderBinding } from '@/modules/heterogeneousAgent/providerBindingHost';
import {
  gcHostedProviderBindingProfiles,
  prepareHostedServerDefaultBinding,
} from '@/modules/heterogeneousAgent/providerBindingHost';
import {
  beginServerDefaultOperation,
  getServerDefaultEndpoint,
  type ServerDefaultOperationSettlement,
  settleServerDefaultOperation,
} from '@/modules/heterogeneousAgent/providerBindingPort';
import type { HeterogeneousAgentImageAttachment } from '@/modules/heterogeneousAgent/types';
import { buildProxyEnv } from '@/modules/networkProxy/envBuilder';
import { createLogger } from '@/utils/logger';

import BrowserControlCtr from './BrowserControlCtr';
import RemoteServerConfigCtr from './RemoteServerConfigCtr';

const logger = createLogger('controllers:HeterogeneousAgentCtr');

// Anthropic auth env vars that must NOT be inherited from the desktop process
// when spawning a local CLI agent. A developer with `ANTHROPIC_API_KEY` (or an
// auth token / base url) exported in their shell would otherwise have it
// forwarded to `claude`, which then switches from its own subscription login to
// that key — an expired / wrong key surfaces as a baffling "Invalid API key"
// and the run exits non-zero. Agents that genuinely want an API key still set
// it through `session.env`, which is spread AFTER the inherited env below and
// therefore wins.
const STRIPPED_INHERITED_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_BASE_URL',
] as const;

/**
 * Inherited `process.env` with the Anthropic auth vars removed. Keep this pure
 * and exported so the "never leak host Anthropic creds into the CLI" invariant
 * can be unit-tested directly.
 */
export const buildInheritedSpawnEnv = (
  sourceEnv: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv => {
  const env = { ...sourceEnv };
  for (const key of STRIPPED_INHERITED_ENV_KEYS) delete env[key];
  return env;
};

const appendLoopbackNoProxy = (env: NodeJS.ProcessEnv): void => {
  const entries = new Set(
    [env.NO_PROXY, env.no_proxy]
      .filter((value): value is string => !!value)
      .flatMap((value) => value.split(','))
      .map((value) => value.trim())
      .filter(Boolean),
  );
  entries.add('127.0.0.1');
  entries.add('localhost');
  const noProxy = [...entries].join(',');
  env.NO_PROXY = noProxy;
  env.no_proxy = noProxy;
};
const CODEX_RESUME_THREAD_NOT_FOUND_PATTERNS = [
  /no conversation found/i,
  /thread .*not found/i,
  /conversation .*not found/i,
  /resume.*not found/i,
] as const;
const CODEX_RESUME_CWD_MISMATCH_PATTERNS = [
  /working directory/i,
  /\bcwd\b/i,
  /different directory/i,
  /directory.*mismatch/i,
] as const;

/** Directory under appStoragePath for caching downloaded files */
const FILE_CACHE_DIR = HETERO_AGENT_FILES_DIR;
const CLI_TRACE_DIR = '.heerogeneous-tracing';

export const redactPromptArgs = (
  args: string[],
  agentType: HeterogeneousCliAgentType,
): string[] => {
  let redactNext = false;
  const supportsShortPromptFlag = agentType === 'kimi-code';

  return args.map((arg) => {
    if (redactNext) {
      redactNext = false;
      return '[REDACTED]';
    }

    if (arg === '--prompt' || (supportsShortPromptFlag && arg === '-p')) {
      redactNext = true;
      return arg;
    }

    if (arg.startsWith('--prompt=')) return '--prompt=[REDACTED]';
    if (supportsShortPromptFlag && arg.startsWith('-p=')) return '-p=[REDACTED]';

    return arg;
  });
};

// ─── IPC types ───

interface StartSessionParams {
  /**
   * Agent type key (e.g., 'claude-code'). Defaults to 'claude-code'. May carry
   * the builtin harness type `'orvilo'`; the session then resolves the
   * engine's CLI family (`claude-code` / `codex`) for spawn/preflight while
   * `orviloEngine` records which engine the harness runs on.
   */
  agentType?: BuiltinHeterogeneousAgentType | HeterogeneousCliAgentType;
  /** Additional CLI arguments */
  args?: string[];
  /** Command to execute */
  command: string;
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Protocol-native model selected after session setup (ACP sessions). */
  initialModel?: string;
  /**
   * Builtin Orvilo engine selection. When set, the session runs the engine's
   * CLI family (`claude-sdk` → claude-code, `codex-app-server` → codex) over
   * its ACP transport (`claude-agent-acp` / `codex-acp`).
   */
  orviloEngine?: OrviloEngineKind;
  /** Credential-free Orvilo Provider reference. Desktop main resolves its secrets. */
  providerBinding?: HeterogeneousProviderBindingReference;
  /** Session ID to resume (for multi-turn) */
  resumeSessionId?: string;
}

export interface StartSessionResult {
  providerBindingKey?: string;
  sessionId: string;
}

/** Run identity the browser MCP tools need to reach the right in-app page. */
interface BrowserRunBinding {
  agentId?: string;
  topicId?: string;
}

interface SendPromptParams {
  /**
   * Agent this run belongs to. Rides along to the renderer so it can tell
   * whether revealing the browser panel would yank the user's view to a run
   * they aren't watching.
   */
  agentId?: string;
  /** Image attachments to include in the prompt (downloaded from url, cached by id) */
  imageList?: HeterogeneousAgentImageAttachment[];
  /**
   * Renderer-side operation id stamped onto every emitted `AgentStreamEvent`.
   * Required: producer-side conversion is the V3 contract — by the time events
   * reach the renderer they must already carry the operation they belong to.
   */
  operationId: string;
  prompt: string;
  /**
   * Prior conversation turns used to rebuild a Claude Code transcript that the
   * CLI garbage-collected (`cleanupPeriodDays`, default 30 days). Only consumed
   * when resuming and the on-disk transcript is missing — see
   * `ensureClaudeCodeResumeTranscript`. Without it, `session/load <staleId>`
   * fails with "No conversation found with session ID".
   */
  resumeReplayMessages?: HeteroSessionImportMessage[];
  sessionId: string;
  /** Extra context injected before the user prompt without mutating the prompt text. */
  systemContext?: string;
  /**
   * Topic this run belongs to. Binds the op to its in-app browser session
   * (`topic:<topicId>`) so the browser MCP tools act on the right page.
   *
   * Not to be confused with `sessionId`, which is the CC/Codex agent session —
   * a different namespace entirely.
   */
  topicId?: string;
}

interface CancelSessionParams {
  sessionId: string;
}

interface SubmitInterventionParams {
  cancelled?: boolean;
  /** When set, signals user-cancelled or timeout — the bridge resolves with isError. */
  cancelReason?: 'timeout' | 'user_cancelled';
  /** Operation id stamped on the request the renderer is responding to. */
  operationId: string;
  /** Structured user answer; ignored when `cancelled` is true. */
  result?: unknown;
  /** Correlation key carried on the original `agent_intervention_request`. */
  toolCallId: string;
}

interface StopSessionParams {
  sessionId: string;
}

interface GetSessionInfoParams {
  sessionId: string;
}

interface GetCodexQuotaParams {
  command?: string;
  env?: Record<string, string>;
  force?: boolean;
}

interface ConsumeCodexRateLimitResetCreditParams {
  command?: string;
  creditId?: string;
  env?: Record<string, string>;
  idempotencyKey: string;
}

interface GetClaudeCodeQuotaParams {
  env?: Record<string, string>;
  force?: boolean;
}

export interface SessionInfo {
  agentSessionId?: string;
}

// ─── Internal session tracking ───

interface AgentSession {
  agentSessionId?: string;
  /**
   * Resolved CLI family this session executes through. For the builtin
   * `'orvilo'` harness this is the engine's family (`claude-code` / `codex`) —
   * `orviloEngine` below records which engine it came from.
   */
  agentType: HeterogeneousCliAgentType;
  args: string[];
  /**
   * True when *we* initiated the kill (cancelSession / stopSession / before-quit).
   * The `exit` handler uses this to route signal-induced non-zero exits through
   * the `complete` broadcast instead of surfacing them as runtime errors —
   * SIGINT(130) / SIGTERM(143) / SIGKILL(137) from our own kill paths are
   * intentional, not agent failures.
   */
  cancelledByUs?: boolean;
  command: string;
  cursorAcpSession?: CursorAcpSession;
  cwd?: string;
  devinAcpSession?: DevinAcpSession;
  droidAcpSession?: DroidAcpSession;
  env?: Record<string, string>;
  grokAcpSession?: GrokAcpSession;
  hostedProviderBinding?: HostedProviderBinding;
  model?: string;
  modelSource?: string;
  /**
   * Set only for builtin-Orvilo sessions: records which engine family the
   * harness runs on (`claude-sdk` → claude-code ACP, `codex-app-server` →
   * codex ACP).
   */
  orviloEngine?: OrviloEngineKind;
  /**
   * Absolute CLI path resolved by spawn preflight detection. Used for spawn()
   * when the configured command is bare: detection can find the CLI through
   * the login-shell PATH or a well-known install location (e.g. an app-bundled
   * Codex CLI) that plain spawn() with the inherited env can't resolve.
   */
  resolvedCommandPath?: string;
  /**
   * PATH the preflight detector used to resolve `resolvedCommandPath`, set only
   * when it fell back to the login-shell PATH. Merged into the child PATH at
   * spawn so a `#!/usr/bin/env node` shim still finds its interpreter — the
   * shim resolving in preflight doesn't guarantee `node` is on the leaner
   * inherited PATH (Finder-launched Electron).
   */
  resolvedCommandSearchPath?: string;
  resumeSessionId?: string;
  /** Present iff the session runs on the server-default (Orvilo) binding. */
  serverDefaultApiConfig?: HeterogeneousServerDefaultApiConfig;
  serverOperationToken?: string;
  sessionId: string;
  standardAcpSession?: StandardAcpSession;
  traeAcpSession?: TraeAcpSession;
}

type SessionErrorPayload = HeterogeneousAgentSessionError | string;

interface CliTraceSession {
  dir: string;
  writeQueue: Promise<void>;
}

export type LhHeteroExecCancellationResult = HeterogeneousAgentCancellationResult;

interface LhHeteroExecTask {
  cancellation?: Promise<LhHeteroExecCancellationResult>;
  exit: Promise<void>;
  process: ChildProcess;
}

interface InteractiveAcpSession {
  run: () => Promise<void>;
}

/**
 * External Agent Controller — manages external agent CLI processes via Electron IPC.
 *
 * Agent-agnostic: delegates spawn-plan construction and stdout framing to a
 * per-agent driver so Claude Code, Codex, and future CLIs can differ in
 * prompt transport, resume semantics, and raw stream shape without turning
 * this controller into a giant `switch`.
 *
 * Lifecycle: startSession → sendPrompt → (heteroAgentEvent broadcasts) → stopSession
 */
interface InterventionSlot {
  bridge: AskUserBridge;
  /** Resolves once bridge.events() iterator ends (after `cancelAll`). */
  pumpDone?: Promise<void>;
}

export default class HeterogeneousAgentCtr {
  /**
   * Remote-server credentials for the tool_result image upload.
   *
   * Injected by the eager `HeterogeneousAgentCtr` wrapper rather than resolved
   * here: this file is a deferred chunk, and reaching back into the App's
   * controller registry from it is exactly what broke — the lookup resolved to
   * `undefined`, and the resulting TypeError escaped as an unhandled rejection
   * that killed the main process. The fallback keeps standalone construction
   * (tests, future call sites) working and never throws.
   */
  private readonly remoteServerAuth: RemoteServerAuth;

  constructor(
    public app: App,
    remoteServerAuth?: RemoteServerAuth,
  ) {
    this.remoteServerAuth = remoteServerAuth ?? {
      getAccessToken: async () => (await this.remoteServerConfigCtr?.getAccessToken()) ?? null,
      getServerUrl: async () => (await this.remoteServerConfigCtr?.getRemoteServerUrl()) ?? null,
    };
  }

  private sessions = new Map<string, AgentSession>();
  /** Device-gateway CLI wrappers keyed by their server operation id. */
  private lhHeteroExecTasks = new Map<string, LhHeteroExecTask>();
  /**
   * Per-operation AskUserQuestion bridge state. Keyed by `operationId` so the
   * `submitIntervention` IPC can route an answer to the right pending MCP
   * handler regardless of which `sessionId` it belongs to (one session can
   * fire many ops over its lifetime).
   */
  private opIdToIntervention = new Map<string, InterventionSlot>();
  /**
   * Op → run identity for browser MCP tool session resolution. The main process
   * otherwise has no idea which topic an operation belongs to, and the browser
   * session is keyed by topic (`topic:<topicId>`).
   */
  private opIdToBrowserBinding = new Map<string, BrowserRunBinding>();
  /** Lazy single MCP server, started on first claude-code prompt. */
  private builtinMcpServer?: OrviloBuiltinMcpServer;
  private builtinMcpStartPromise?: Promise<OrviloBuiltinMcpServer>;
  // Fresh window sits under the renderer's 2-minute auto-refresh so each
  // scheduled poll reaches the usage API instead of a cache echo.
  private readonly claudeCodeQuotaCache = new QuotaSnapshotCache<ClaudeCodeQuotaSnapshot>({
    freshMs: CLAUDE_CODE_QUOTA_FRESH_MS,
  });
  private readonly codexQuotaCache = new QuotaSnapshotCache<CodexQuotaSnapshot>();

  /**
   * Typed as optional on purpose: a deferred chunk cannot assume the registry
   * hands back the controller it asks for.
   */
  private get remoteServerConfigCtr(): RemoteServerConfigCtr | undefined {
    return this.app.getController(RemoteServerConfigCtr);
  }

  /**
   * Uploads a base64 tool_result image (CC `Read` on an image file) to the file
   * store, so the persisted event carries a `{ fileId, url }` reference instead
   * of heavy base64. Mirrors what `lh hetero exec` does for the gateway path.
   */
  private uploadResultImage = createFileStoreImageUploader(() =>
    createLambdaFileStorePort(this.remoteServerAuth),
  );

  private resolveSessionCommand(session: AgentSession): string {
    return resolveHeterogeneousAgentCommand(session.agentType, session.command);
  }

  private buildCliMissingError(session: AgentSession): HeterogeneousAgentSessionError {
    return buildHeterogeneousAgentCliNotFoundError({
      agentType: session.agentType,
      command: session.command,
    });
  }

  private resolveSessionWorkingDirectory(session: AgentSession): string {
    return session.cwd || electronApp.getPath('desktop');
  }

  private buildWorkingDirectoryMissingError(
    session: AgentSession,
    workingDirectory: string,
  ): HeterogeneousAgentSessionError {
    return {
      agentType: session.agentType,
      code: HeterogeneousAgentSessionErrorCode.WorkingDirectoryNotFound,
      command: this.resolveSessionCommand(session),
      message: describeUnusableWorkingDirectory(workingDirectory),
      workingDirectory,
    };
  }

  private buildCliAuthRequiredError(
    session: AgentSession,
    stderr: string,
  ): HeterogeneousAgentSessionError {
    return buildHeterogeneousAgentAuthRequiredError({
      agentType: session.agentType,
      command: session.command,
      stderr,
    });
  }

  private getErrorMessage(error: unknown): string | undefined {
    return typeof error === 'string'
      ? error
      : error instanceof Error
        ? error.message
        : typeof error === 'object' &&
            error &&
            'message' in error &&
            typeof error.message === 'string'
          ? error.message
          : undefined;
  }

  private buildCodexResumeError(
    code:
      | typeof HeterogeneousAgentSessionErrorCode.ResumeCwdMismatch
      | typeof HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
    stderr: string,
    session: AgentSession,
  ): HeterogeneousAgentSessionError {
    const message =
      code === HeterogeneousAgentSessionErrorCode.ResumeCwdMismatch
        ? 'The saved Codex thread can only be resumed from its original working directory.'
        : 'The saved Codex thread could not be found, so it can no longer be resumed.';

    return {
      agentType: 'codex',
      code,
      command: session.command,
      message,
      resumeSessionId: session.resumeSessionId,
      stderr,
      workingDirectory: session.cwd,
    };
  }

  private getCodexResumeError(
    error: unknown,
    session: AgentSession,
  ): HeterogeneousAgentSessionError | undefined {
    if (session.agentType !== 'codex' || !session.resumeSessionId) return;

    const message = this.getErrorMessage(error);

    if (!message) return;

    if (CODEX_RESUME_CWD_MISMATCH_PATTERNS.some((pattern) => pattern.test(message))) {
      return this.buildCodexResumeError(
        HeterogeneousAgentSessionErrorCode.ResumeCwdMismatch,
        message,
        session,
      );
    }

    if (CODEX_RESUME_THREAD_NOT_FOUND_PATTERNS.some((pattern) => pattern.test(message))) {
      return this.buildCodexResumeError(
        HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
        message,
        session,
      );
    }
  }

  private getDroidResumeError(
    error: unknown,
    session: AgentSession,
  ): HeterogeneousAgentSessionError | undefined {
    if (
      session.agentType !== 'droid' ||
      !session.resumeSessionId ||
      !isDroidAcpSessionNotFoundError(error)
    ) {
      return;
    }

    return {
      agentType: 'droid',
      code: HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
      command: session.command,
      details: {
        code: error.rpcError.code,
        data: error.rpcError.data,
      },
      message:
        'The saved Factory Droid session could not be found, so a new conversation will start.',
      resumeSessionId: session.resumeSessionId,
      stderr: error.message,
      workingDirectory: session.cwd,
    };
  }

  private getGrokResumeError(
    error: unknown,
    session: AgentSession,
  ): HeterogeneousAgentSessionError | undefined {
    if (
      session.agentType !== 'grok-build' ||
      !session.resumeSessionId ||
      !(error instanceof AcpRpcResponseError) ||
      error.method !== 'session/load' ||
      !isPlainObject(error.rpcError.data) ||
      error.rpcError.data.code !== 'FS_NOT_FOUND'
    ) {
      return;
    }

    return {
      agentType: 'grok-build',
      code: HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
      command: session.command,
      details: {
        code: error.rpcError.code,
        data: error.rpcError.data,
      },
      message: 'The saved Grok Build session could not be found, so it can no longer be resumed.',
      resumeSessionId: session.resumeSessionId,
      stderr: error.message,
      workingDirectory: session.cwd,
    };
  }

  private getCursorResumeError(
    error: unknown,
    session: AgentSession,
  ): HeterogeneousAgentSessionError | undefined {
    if (
      session.agentType !== 'cursor' ||
      !session.resumeSessionId ||
      !isCursorAcpSessionNotFoundError(error)
    ) {
      return;
    }

    return {
      agentType: 'cursor',
      code: HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
      command: session.command,
      details: {
        code: error.rpcError.code,
        message: error.rpcError.message,
      },
      message:
        'The saved Cursor session cannot be loaded through ACP, so a new conversation will start.',
      resumeSessionId: session.resumeSessionId,
      stderr: error.message,
      workingDirectory: session.cwd,
    };
  }

  private getDevinResumeError(
    error: unknown,
    session: AgentSession,
  ): HeterogeneousAgentSessionError | undefined {
    if (
      session.agentType !== 'devin' ||
      !session.resumeSessionId ||
      !isDevinAcpSessionNotFoundError(error)
    ) {
      return;
    }

    return {
      agentType: 'devin',
      code: HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
      command: session.command,
      details: {
        code: error.rpcError.code,
        data: error.rpcError.data,
      },
      message: 'The saved Devin session could not be found, so a new conversation will start.',
      resumeSessionId: session.resumeSessionId,
      stderr: error.message,
      workingDirectory: session.cwd,
    };
  }

  /**
   * Standard-ACP agents report a stale resume as a `session/load` RPC error —
   * map it to the same structured payload the dedicated ACP sessions produce.
   */
  private getStandardAcpResumeError(
    error: unknown,
    session: AgentSession,
  ): HeterogeneousAgentSessionError | undefined {
    if (
      !ACP_RUNTIME_AGENT_TYPES.has(session.agentType) ||
      !session.resumeSessionId ||
      !isStandardAcpSessionNotFoundError(error)
    ) {
      return;
    }

    const label = getAcpAgentRuntime(session.agentType)?.label ?? session.agentType;
    return {
      agentType: session.agentType,
      code: HeterogeneousAgentSessionErrorCode.ResumeThreadNotFound,
      command: session.command,
      details: {
        code: error.rpcError.code,
        data: error.rpcError.data,
      },
      message: `The saved ${label} session could not be found, so it can no longer be resumed.`,
      resumeSessionId: session.resumeSessionId,
      stderr: error.message,
      workingDirectory: session.cwd,
    };
  }

  private getCliAuthRequiredError(
    error: unknown,
    session: AgentSession,
  ): HeterogeneousAgentSessionError | undefined {
    const message = this.getErrorMessage(error);

    if (!message) return;
    if (!isHeterogeneousAgentAuthRequired(session.agentType, message)) return;

    return this.buildCliAuthRequiredError(session, message);
  }

  private getSessionErrorPayload(error: unknown, session: AgentSession): SessionErrorPayload {
    if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT') {
      const workingDirectory = this.resolveSessionWorkingDirectory(session);
      if (!isSpawnableDirectory(workingDirectory)) {
        return this.buildWorkingDirectoryMissingError(session, workingDirectory);
      }

      const cliMissingError = this.buildCliMissingError(session);
      if (cliMissingError) return cliMissingError;
    }

    const resumeError =
      this.getCodexResumeError(error, session) ??
      this.getDroidResumeError(error, session) ??
      this.getGrokResumeError(error, session) ??
      this.getCursorResumeError(error, session) ??
      this.getDevinResumeError(error, session) ??
      this.getStandardAcpResumeError(error, session);
    if (resumeError) return resumeError;

    const authRequiredError = this.getCliAuthRequiredError(error, session);
    if (authRequiredError) return authRequiredError;

    return error instanceof Error ? error.message : String(error);
  }

  private async getSpawnPreflightError(
    session: AgentSession,
  ): Promise<HeterogeneousAgentSessionError | undefined> {
    const workingDirectory = this.resolveSessionWorkingDirectory(session);
    if (!isSpawnableDirectory(workingDirectory)) {
      return this.buildWorkingDirectoryMissingError(session, workingDirectory);
    }

    const defaultCommand = getHeterogeneousAgentConfigOrThrow(session.agentType).defaultCommand;

    const command = this.resolveSessionCommand(session);
    const status =
      command === defaultCommand
        ? // Normal launches must reuse the successful binary/PATH detection.
          // Forcing here invalidates the login-shell PATH cache on every message,
          // putting a slow interactive shell back on the critical path. Explicit
          // Rescan actions remain responsible for force-refreshing the cache.
          await this.app.binaryManager?.detect?.(defaultCommand)
        : await detectHeterogeneousCliCommand(session.agentType, command);

    if (!status || status.available) {
      if (
        session.agentType === 'kimi-code' &&
        session.hostedProviderBinding &&
        status?.version &&
        semver.lt(status.version, '0.6.0')
      ) {
        return {
          agentType: session.agentType,
          code: 'cli_version_unsupported',
          command,
          message: `Kimi Code 0.6.0 or newer is required to use a Orvilo provider. Installed version: ${status.version}.`,
          workingDirectory,
        };
      }
      if (
        session.agentType === 'trae' &&
        session.hostedProviderBinding &&
        status?.version &&
        semver.lt(status.version, '0.201.2')
      ) {
        return {
          agentType: session.agentType,
          code: 'cli_version_unsupported',
          command,
          message: `TRAE CLI 0.201.2 or newer is required to use a Orvilo provider. Installed version: ${status.version}.`,
          workingDirectory,
        };
      }

      // Spawn through the detector-resolved absolute path when the configured
      // command is bare — detection may have located the CLI somewhere plain
      // spawn() can't (login-shell PATH, app-bundled Codex CLI, …).
      const useResolvedPath = Boolean(status?.path) && !command.includes(path.sep);
      session.resolvedCommandPath = useResolvedPath ? status!.path : undefined;
      // Carry the login-shell PATH the detector resolved through, so a
      // `#!/usr/bin/env node` shim spawned by absolute path still finds `node`.
      session.resolvedCommandSearchPath = useResolvedPath ? status!.resolvedPathEnv : undefined;
      return;
    }

    // A shell probe that ran out of time says nothing about whether the CLI is
    // installed — on a busy machine it is the likeliest outcome, and the run
    // before it may well have succeeded. Telling the user to install it would
    // send them after software that is already there.
    if (isLoginShellTimeoutStatus(status)) {
      return {
        agentType: session.agentType,
        code: 'cli_detection_timeout',
        command,
        message:
          `Timed out looking for \`${command}\` while reading PATH from your login shell. ` +
          'This usually means the machine was busy rather than that the CLI is missing — ' +
          'retry, or set an absolute path for the command in the agent settings.',
        workingDirectory,
      };
    }

    return this.buildCliMissingError(session);
  }

  private buildSessionSpawnEnv(session: AgentSession): NodeJS.ProcessEnv {
    // Forward the user's proxy settings to the CLI/SDK subprocess. The
    // main-process undici dispatcher doesn't reach child processes — they need
    // env vars.
    const proxyEnv = buildProxyEnv(this.app.storeManager.get('networkProxy'));
    const inheritedEnv = buildInheritedSpawnEnv();
    // When preflight resolved the CLI via the login-shell PATH, spawn with
    // that PATH (a superset of the inherited one) so a `#!/usr/bin/env node`
    // shim finds its interpreter. `session.env` still wins if it sets PATH.
    if (session.resolvedCommandSearchPath) inheritedEnv.PATH = session.resolvedCommandSearchPath;
    const env: NodeJS.ProcessEnv = {
      ...inheritedEnv,
      ...proxyEnv,
      ...(session.agentType === 'codebuddy'
        ? { CODEBUDDY_CODE_DISABLE_BACKGROUND_TASKS: '1' }
        : {}),
      ...session.env,
    };
    const operationTokenEnvKey = session.hostedProviderBinding?.operationTokenEnvKey;
    if (session.serverOperationToken && operationTokenEnvKey) {
      env[operationTokenEnvKey] = session.serverOperationToken;
    }
    if (
      session.agentType === 'kimi-code' &&
      session.hostedProviderBinding &&
      env.KIMI_MODEL_BASE_URL?.startsWith('http://127.0.0.1:')
    ) {
      appendLoopbackNoProxy(env);
    }
    if (session.agentType === 'grok-build' && session.hostedProviderBinding) {
      // Empty XAI_API_KEY values still count as configured in Grok and can
      // trigger an empty-key probe. Remove both current and legacy inherited
      // credentials so the managed model's env_key is the only BYOK source.
      delete env.GROK_CODE_XAI_API_KEY;
      delete env.XAI_API_KEY;
    }
    return env;
  }

  private get shouldTraceCliOutput(): boolean {
    if (process.env.NODE_ENV === 'test') return false;
    // Dev builds always trace. Packaged builds trace only when the user has
    // flipped the Help-menu developer toggle — so production issues can be
    // captured on demand without polluting normal runs.
    if (!electronApp.isPackaged) return true;
    return this.app.storeManager.get('heteroTracingEnabled', false);
  }

  /**
   * Root directory for CLI trace sessions.
   *
   * When the user has explicitly opted in via the `heteroTracingEnabled`
   * Help-menu toggle, centralize traces under the app storage dir
   * (`<appStoragePath>/heteroAgent/tracing`) — this is the only path packaged
   * builds ever trace through, and it keeps traces out of the user's real
   * project directory while staying reachable from one stable Help-menu entry.
   *
   * Otherwise (a plain dev run with the toggle off) keep writing into the
   * working directory (`cwd/.heerogeneous-tracing`) — devs expect traces to
   * show up alongside the repo they're running in.
   */
  private resolveTraceRootDir(cwd: string): string {
    if (this.app.storeManager.get('heteroTracingEnabled', false)) {
      return path.join(this.app.appStoragePath, HETERO_AGENT_TRACING_DIR);
    }
    return path.join(cwd, CLI_TRACE_DIR);
  }

  private formatTraceTimestamp(date: Date): string {
    const pad = (value: number) => value.toString().padStart(2, '0');

    return [
      date.getFullYear(),
      pad(date.getMonth() + 1),
      pad(date.getDate()),
      '-',
      pad(date.getHours()),
      pad(date.getMinutes()),
      pad(date.getSeconds()),
    ].join('');
  }

  private sanitizeTracePathSegment(value: string): string {
    const sanitized = value
      .replaceAll(path.sep, '-')
      .replaceAll(/[^\w.-]+/g, '-')
      .replaceAll(/^-+|-+$/g, '')
      .slice(0, 80);

    return sanitized || 'unknown';
  }

  private getAttachmentTraceSummary(image: HeterogeneousAgentImageAttachment) {
    let urlKind = 'unknown';

    try {
      urlKind = new URL(image.url).protocol.replace(/:$/, '') || urlKind;
    } catch {
      urlKind = image.url.startsWith('data:') ? 'data' : 'unknown';
    }

    return {
      id: image.id,
      urlKind,
    };
  }

  private async createCliTraceSession({
    cliArgs,
    cwd,
    imageList,
    session,
    stdinPayload,
  }: {
    cliArgs: string[];
    cwd: string;
    imageList: HeterogeneousAgentImageAttachment[];
    session: AgentSession;
    stdinPayload?: string;
  }): Promise<CliTraceSession | undefined> {
    if (!this.shouldTraceCliOutput) return;

    // Don't materialize the cwd via mkdir — if the caller passed a stale or
    // typo'd path, we want spawn() to fail loudly instead of silently running
    // the agent in an empty auto-created directory.
    try {
      await access(cwd);
    } catch {
      return;
    }

    const createdAt = new Date();
    const rootDir = this.resolveTraceRootDir(cwd);
    const agentDir = path.join(rootDir, this.sanitizeTracePathSegment(session.agentType));
    const traceId = `${this.formatTraceTimestamp(createdAt)}-${this.sanitizeTracePathSegment(
      session.sessionId,
    )}`;
    const dir = path.join(agentDir, traceId);

    try {
      await mkdir(dir, { recursive: true });
      await writeFile(path.join(rootDir, '.last-live-trace'), `${dir}\n`);
      await writeFile(path.join(dir, 'stdout.jsonl'), '');
      await writeFile(path.join(dir, 'stderr.log'), '');
      if (stdinPayload !== undefined) {
        await writeFile(path.join(dir, 'stdin.txt'), '');
      }
      await writeFile(
        path.join(dir, 'meta.json'),
        `${JSON.stringify(
          {
            agentSessionId: session.agentSessionId,
            agentType: session.agentType,
            args: redactPromptArgs(cliArgs, session.agentType),
            attachments: imageList.map((image) => this.getAttachmentTraceSummary(image)),
            command: session.command,
            createdAt: createdAt.toISOString(),
            cwd,
            envKeys: session.env ? Object.keys(session.env).sort() : [],
            model: session.model,
            modelSource: session.modelSource,
            resumeSessionId: session.resumeSessionId,
            sessionId: session.sessionId,
            stdinBytes: stdinPayload === undefined ? 0 : Buffer.byteLength(stdinPayload),
            stdinFile: stdinPayload === undefined ? undefined : 'stdin.txt',
            stderrFile: 'stderr.log',
            stdoutFile: 'stdout.jsonl',
          },
          null,
          2,
        )}\n`,
      );

      return { dir, writeQueue: Promise.resolve() };
    } catch (error) {
      logger.warn('Failed to initialize CLI trace directory:', error);
    }
  }

  private queueCliTraceWrite(
    trace: CliTraceSession | undefined,
    write: () => Promise<void>,
  ): Promise<void> | undefined {
    if (!trace) return;

    trace.writeQueue = trace.writeQueue.then(write).catch((error) => {
      logger.warn('Failed to write CLI trace file:', error);
    });

    return trace.writeQueue;
  }

  private appendCliTraceFile(
    trace: CliTraceSession | undefined,
    fileName: string,
    data: Buffer | string,
  ): Promise<void> | undefined {
    if (!trace) return;

    const filePath = path.join(trace.dir, fileName);

    return this.queueCliTraceWrite(trace, () => appendFile(filePath, data));
  }

  private writeCliTraceFile(
    trace: CliTraceSession | undefined,
    fileName: string,
    data: string,
  ): Promise<void> | undefined {
    if (!trace) return;

    const filePath = path.join(trace.dir, fileName);

    return this.queueCliTraceWrite(trace, () => writeFile(filePath, data));
  }

  private writeCliTraceJson(
    trace: CliTraceSession | undefined,
    fileName: string,
    payload: unknown,
  ): Promise<void> | undefined {
    return this.writeCliTraceFile(trace, fileName, `${JSON.stringify(payload, null, 2)}\n`);
  }

  private async flushCliTrace(trace: CliTraceSession | undefined): Promise<void> {
    await trace?.writeQueue;
  }

  // ─── Broadcast ───

  private broadcast<T>(channel: string, data: T) {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, data);
      }
    }
  }

  // ─── AskUserQuestion MCP server () ───

  /** Register and broadcast a native ACP intervention without starting an MCP server. */
  private setupAcpInterventionForOp(
    operationId: string,
    sessionId: string,
    provider: NonNullable<AskUserBridgeOptions['provider']>,
  ): {
    bridge: AskUserBridge;
    cleanup: () => Promise<void>;
  } {
    // Cursor keeps its legacy Claude Code renderer identifier. Droid has a
    // first-class identifier, while provider remains explicit for both.
    const bridge = new AskUserBridge(operationId, {
      identifier: provider === 'cursor' ? 'claude-code' : provider,
      provider,
    });
    const pumpDone = (async () => {
      for await (const event of bridge.events()) {
        this.broadcast('heteroAgentEvent', { event, sessionId });
      }
    })().catch((error) => {
      logger.warn('ACP AskUserQuestion bridge pump error:', error);
    });
    const slot: InterventionSlot = { bridge, pumpDone };
    this.opIdToIntervention.set(operationId, slot);

    return {
      bridge,
      cleanup: async () => {
        bridge.cancelAll('session_ended');
        await pumpDone;
        this.opIdToIntervention.delete(operationId);
      },
    };
  }

  /**
   * Lazy single-instance MCP server for CC's AskUserQuestion replacement.
   * First claude-code prompt triggers `start()`; subsequent prompts reuse
   * the same listener. Concurrent first-callers de-dupe via the in-flight
   * promise so we don't bind two ports.
   */
  private async ensureBuiltinMcpServerStarted(): Promise<OrviloBuiltinMcpServer> {
    if (this.builtinMcpServer) return this.builtinMcpServer;
    if (!this.builtinMcpStartPromise) {
      this.builtinMcpStartPromise = (async () => {
        const [{ OrviloBuiltinMcpServer }, { buildBrowserMcpTools }] = await Promise.all([
          import('@orvilo/heterogeneous-agents/builtinMcp'),
          import('@/modules/heterogeneousAgent/browserMcpTools'),
        ]);
        const server = new OrviloBuiltinMcpServer({
          // In-app browser control tools ride the same per-op MCP server so
          // CC can drive the browser sidebar ( M3, hetero path).
          extraTools: buildBrowserMcpTools((operationId, apiName, args) =>
            this.runBrowserMcpTool(operationId, apiName, args),
          ),
        });
        await server.start();
        this.builtinMcpServer = server;
        logger.info('AskUserQuestion MCP server started:', server.url);
        return server;
      })().catch((err) => {
        // Reset so a later sendPrompt can retry; surface the error.
        this.builtinMcpStartPromise = undefined;
        logger.error('Failed to start AskUserQuestion MCP server:', err);
        throw err;
      });
    }
    return this.builtinMcpStartPromise;
  }

  /**
   * Register a per-op bridge for a standard-ACP session. The bridge answers
   * `session/request_permission` + `elicitation/create` directly and also
   * backs the `lobe_cc` MCP server when the agent mounts it (`session/new`'s
   * `mcpServers` carries the per-op HTTP URL — no temp `mcp.json` file).
   */
  private async setupStandardAcpInterventionForOp(
    operationId: string,
    session: AgentSession,
    browserBinding?: BrowserRunBinding,
  ): Promise<{
    bridge: AskUserBridge;
    cleanup: () => Promise<void>;
    mcpServers?: Record<string, unknown>[];
  }> {
    const provider = session.agentType as NonNullable<AskUserBridgeOptions['provider']>;
    // claude-code / qoder mount the lobe_cc MCP server for the
    // `ask_user_question` tool + in-app browser tools (the builtin Orvilo
    // claude-sdk engine resolves to the claude-code family, so it is covered
    // here; the codex engine historically exposes no builtin tools). Other
    // agents only need the native permission/elicitation bridge.
    const mountsBuiltinMcp = session.agentType === 'claude-code' || session.agentType === 'qoder';
    if (!mountsBuiltinMcp) {
      return this.setupAcpInterventionForOp(operationId, session.sessionId, provider);
    }

    const server = await this.ensureBuiltinMcpServerStarted();
    const bridge = server.registerOperation(
      operationId,
      new AskUserBridge(operationId, { identifier: provider, provider }),
    );
    if (browserBinding?.agentId || browserBinding?.topicId) {
      this.opIdToBrowserBinding.set(operationId, browserBinding);
    }
    const pumpDone = (async () => {
      for await (const event of bridge.events()) {
        this.broadcast('heteroAgentEvent', { event, sessionId: session.sessionId });
      }
    })().catch((error) => {
      logger.warn('ACP AskUserQuestion bridge pump error:', error);
    });
    const slot: InterventionSlot = { bridge, pumpDone };
    this.opIdToIntervention.set(operationId, slot);

    return {
      bridge,
      cleanup: async () => {
        // Unregistering on the server cancels all bridge pendings AND closes
        // the events iterator (cancelAll fires from within unregisterOperation).
        this.builtinMcpServer?.unregisterOperation(operationId);
        await pumpDone;
        this.opIdToIntervention.delete(operationId);
        this.opIdToBrowserBinding.delete(operationId);
      },
      mcpServers: [
        {
          name: 'lobe_cc',
          type: 'http',
          url: server.urlForOperation(operationId),
        },
      ],
    };
  }

  /**
   * Execute one in-app browser api call on behalf of a CC MCP tool. Forwards
   * through `BrowserControlCtr.runGatewayToolCall` — the same funnel cloud
   * gateway calls use — so the renderer-side `browserExecutor` (webview
   * mount, snapshot refs, cursor overlay) stays the single source of truth.
   */
  private async runBrowserMcpTool(
    operationId: string,
    apiName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult> {
    const binding = this.opIdToBrowserBinding.get(operationId);
    if (!binding?.agentId || !binding.topicId) {
      return {
        content: [
          {
            text: 'The in-app browser is not available for this run (no topic binding). Continue without it.',
            type: 'text',
          },
        ],
        isError: true,
      };
    }

    const result = await this.app.getController(BrowserControlCtr).runGatewayToolCall(apiName, {
      ...args,
      __agentId: binding.agentId,
      __topicId: binding.topicId,
    });

    const text =
      result.content ?? result.error?.message ?? (result.success ? 'OK' : 'Browser action failed');
    const content: McpToolResult['content'] = [{ text, type: 'text' }];

    // Screenshot: hand the image back as an MCP image block so CC can
    // actually see the page (unlike the homogeneous runtime's text-only echo).
    if (apiName === 'screenshot') {
      const dataUrl = (result.state as { dataUrl?: string } | undefined)?.dataUrl;
      const match =
        typeof dataUrl === 'string' ? dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/) : null;
      if (match) content.push({ data: match[2], mimeType: match[1], type: 'image' });
    }

    return { content, isError: !result.success };
  }

  // ─── File cache ───

  private get fileCacheDir(): string {
    return path.join(this.app.appStoragePath, FILE_CACHE_DIR);
  }

  // ─── IPC methods ───

  /**
   * Create a session (stores config, process spawned on sendPrompt).
   */
  async startSession(params: StartSessionParams): Promise<StartSessionResult> {
    const sessionId = randomUUID();
    const declaredAgentType = params.agentType || 'claude-code';
    // The builtin Orvilo harness declares itself as `agentType: 'orvilo'` (or
    // implicitly via `orviloEngine`); it has no executable of its own. Resolve
    // the engine's CLI family once so every downstream gate — driver, command
    // resolution, provider bindings, preflight, error classification — works
    // in family terms. `orviloEngine` on the session records the engine.
    const orviloEngine =
      declaredAgentType === 'orvilo' || params.orviloEngine !== undefined
        ? resolveOrviloEngine(params.orviloEngine)
        : undefined;
    const agentType: HeterogeneousCliAgentType = orviloEngine
      ? resolveOrviloCliAgentType(orviloEngine)
      : (declaredAgentType as HeterogeneousCliAgentType);
    const driver = getHeterogeneousAgentDriver(agentType);
    let hostedProviderBinding: HostedProviderBinding | undefined;

    // User-provider (BYOK) bindings are retired — the only supported binding
    // is the deployment-owned server-default relay. A `kind: 'provider'`
    // reference can only arrive from a mismatched client; fail loudly instead
    // of silently running unbound.
    if (params.providerBinding && params.providerBinding.kind !== 'server-default') {
      throw new Error('Orvilo Provider bindings are no longer supported.');
    }

    if (params.providerBinding?.kind === 'server-default') {
      hostedProviderBinding = await prepareHostedServerDefaultBinding({
        agentType,
        appStoragePath: this.app.appStoragePath,
        args: params.args || [],
        driver,
        endpoint: await getServerDefaultEndpoint(this.remoteServerAuth),
        env: params.env,
        model: params.providerBinding.apiConfig.model,
        sessionId,
      });
    }

    if (hostedProviderBinding) {
      // Opportunistic sweep of long-unused binding profiles (provider deleted,
      // endpoint changed, identity version bumped). The profile in use was just
      // touched by prepare, so it is never a candidate. Never blocks the run.
      gcHostedProviderBindingProfiles(this.app.appStoragePath)
        .then((removedProfiles) => {
          if (removedProfiles.length > 0)
            logger.info('Removed stale provider-binding profiles:', removedProfiles);
        })
        .catch((error) => logger.warn('Provider-binding profile GC failed:', error));
    }

    const resumeSessionId =
      !hostedProviderBinding ||
      params.providerBinding?.resumeBindingKey === hostedProviderBinding.bindingKey
        ? params.resumeSessionId
        : undefined;

    this.sessions.set(sessionId, {
      // If resuming, pre-set the agent session ID so sendPrompt issues ACP session/load
      agentSessionId: resumeSessionId,
      agentType,
      args: hostedProviderBinding?.args ?? params.args ?? [],
      command: params.command,
      cwd: params.cwd,
      env: hostedProviderBinding?.env ?? params.env,
      hostedProviderBinding,
      serverDefaultApiConfig:
        params.providerBinding?.kind === 'server-default'
          ? params.providerBinding.apiConfig
          : undefined,
      model: agentType === 'trae' && hostedProviderBinding ? undefined : params.initialModel,
      orviloEngine,
      sessionId,
      resumeSessionId,
    });

    logger.info('Session created:', {
      agentType,
      providerBinding: !!hostedProviderBinding,
      sessionId,
    });
    return { providerBindingKey: hostedProviderBinding?.bindingKey, sessionId };
  }

  /**
   * Send a prompt to an agent session.
   *
   * Every transport is an ACP v1 session: the session pipes `session/update`
   * notifications through its internal `AgentStreamPipeline` (adapter →
   * toStreamEvent) and this controller broadcasts the resulting
   * `AgentStreamEvent`s on `heteroAgentEvent`.
   */
  async sendPrompt(params: SendPromptParams): Promise<ServerDefaultOperationSettlement | void> {
    const session = this.sessions.get(params.sessionId);
    if (session) session.cancelledByUs = false;
    const serverDefaultApiConfig = session?.serverDefaultApiConfig;
    if (!session || !serverDefaultApiConfig) return this.sendPromptImpl(params);
    if (!params.topicId) throw new Error('Server-default execution requires a topic');
    if (!isServerDefaultHeterogeneousAgentType(session.agentType)) {
      throw new Error(`Server-default execution does not support ${session.agentType}`);
    }

    const operation = await beginServerDefaultOperation(this.remoteServerAuth, {
      agentType: session.agentType,
      agentId: params.agentId,
      model: serverDefaultApiConfig.model,
      operationId: params.operationId,
      topicId: params.topicId,
    });
    let result: 'done' | 'error' = 'error';
    let settlement: ServerDefaultOperationSettlement | void;
    try {
      if (session.cancelledByUs) {
        await this.completeCancelledSessionBeforeLaunch(session);
        return;
      }

      session.serverOperationToken = operation.token;
      await this.sendPromptImpl(params);
      if (!session.cancelledByUs) result = 'done';
    } finally {
      session.serverOperationToken = undefined;
      settlement = await settleServerDefaultOperation(this.remoteServerAuth, {
        cancelled: session.cancelledByUs,
        operationId: params.operationId,
        result,
      }).catch((error) => logger.warn('Failed to settle server-default operation:', error));
    }
    return settlement;
  }

  private async sendPromptImpl(params: SendPromptParams): Promise<void> {
    const session = this.sessions.get(params.sessionId);
    if (!session) throw new Error(`Session not found: ${params.sessionId}`);

    let preflightError;
    try {
      preflightError = await this.getSpawnPreflightError(session);
    } catch (error) {
      await session.hostedProviderBinding?.cleanup();
      throw error;
    }
    if (session.cancelledByUs) {
      await this.completeCancelledSessionBeforeLaunch(session);
      return;
    }
    if (preflightError) {
      this.broadcast('heteroAgentSessionError', {
        error: preflightError,
        sessionId: session.sessionId,
      });
      await session.hostedProviderBinding?.cleanup();
      throw new Error(preflightError.message);
    }

    // Revive a Claude Code session whose local transcript the CLI already
    // garbage-collected (`cleanupPeriodDays`, default 30 days). Rebuilding it
    // from the turns Orvilo still holds turns a hard
    // "No conversation found with session ID" into a normal `session/load`
    // that hydrates the native history. No-ops when the transcript still
    // exists — claude-agent-acp reads the same on-disk transcripts for resume.
    if (
      session.agentType === 'claude-code' &&
      session.agentSessionId &&
      session.cwd &&
      params.resumeReplayMessages?.length
    ) {
      try {
        const ensured = await ensureClaudeCodeResumeTranscript({
          configDir: session.hostedProviderBinding?.profileDir,
          cwd: session.cwd,
          messages: params.resumeReplayMessages,
          sessionId: session.agentSessionId,
        });
        if (ensured.written)
          logger.info('Rebuilt GC-ed Claude Code transcript for resume:', {
            path: ensured.path,
            turns: params.resumeReplayMessages.length,
          });
      } catch (error) {
        // Never block the run on this — worst case CC starts a fresh session.
        logger.warn('Failed to rebuild Claude Code resume transcript:', error);
      }
    }

    if (session.agentType === 'grok-build') {
      return this.sendPromptWithGrokAcp(params, session);
    }

    if (session.agentType === 'cursor') {
      return this.sendPromptWithCursorAcp(params, session);
    }

    if (session.agentType === 'droid') {
      return this.sendPromptWithDroidAcp(params, session);
    }

    if (session.agentType === 'devin') {
      return this.sendPromptWithDevinAcp(params, session);
    }

    if (session.agentType === 'trae') {
      return this.sendPromptWithTraeAcp(params, session);
    }

    // Every remaining local agent executes through the shared standard-ACP
    // session — native `*-acp` modes and upstream bridge binaries alike. The
    // builtin-Orvilo engines land here too: `claude-sdk` resolves to
    // claude-code → claude-agent-acp, `codex-app-server` to codex → codex-acp.
    if (ACP_RUNTIME_AGENT_TYPES.has(session.agentType)) {
      try {
        return await this.sendPromptWithStandardAcp(params, session);
      } finally {
        // The ACP helper owns cleanup once `run()` starts; this outer guard
        // also covers input/trace/session construction failures before that try/finally.
        await session.hostedProviderBinding?.cleanup();
      }
    }

    throw new Error(`Unsupported heterogeneous agent type: ${session.agentType}`);
  }

  private async completeCancelledSessionBeforeLaunch(session: AgentSession): Promise<void> {
    await session.hostedProviderBinding?.cleanup();
    this.broadcast('heteroAgentSessionComplete', { sessionId: session.sessionId });
  }

  private async sendPromptWithGrokAcp(
    params: SendPromptParams,
    session: AgentSession,
  ): Promise<void> {
    const cwd = session.cwd || electronApp.getPath('desktop');
    const spawnEnv = this.buildSessionSpawnEnv(session);
    const commandPath = session.resolvedCommandPath ?? this.resolveSessionCommand(session);
    const promptInput = buildHeterogeneousPrompt({
      imageList: params.imageList,
      prompt: params.prompt,
      systemContext: params.systemContext,
    });
    let prompt;
    try {
      prompt = await buildGrokAcpPrompt(promptInput, { cacheDir: this.fileCacheDir });
    } catch (error) {
      logger.error('Failed to prepare Grok Build ACP input:', error);
      throw new Error(
        `Failed to attach image(s) to Grok Build: ${this.getErrorMessage(error) || 'Unknown error'}`,
        { cause: error },
      );
    }

    const traceInput = `${JSON.stringify(prompt)}\n`;
    const traceSession = await this.createCliTraceSession({
      cliArgs: buildGrokAcpArgs(session.args),
      cwd,
      imageList: params.imageList ?? [],
      session,
      stdinPayload: traceInput,
    });
    void this.writeCliTraceFile(traceSession, 'stdin.txt', traceInput);

    if (session.cancelledByUs) {
      await this.completeCancelledSessionBeforeLaunch(session);
      return;
    }

    const acpSession = new GrokAcpSession({
      args: session.args,
      clientVersion: electronApp.getVersion(),
      commandPath,
      cwd,
      env: spawnEnv,
      onEvents: async (events) => {
        for (const event of events) {
          this.broadcast('heteroAgentEvent', {
            event,
            sessionId: session.sessionId,
          });
        }
      },
      onRawMessage: (line) => this.appendCliTraceFile(traceSession, 'stdout.jsonl', line),
      onRuntimeStatus: (status) => {
        this.broadcast('heteroAgentRuntimeStatus', status);
      },
      onSessionId: (agentSessionId) => {
        if (agentSessionId !== session.agentSessionId) session.agentSessionId = agentSessionId;
      },
      onStderr: (data) => this.appendCliTraceFile(traceSession, 'stderr.log', data),
      operationId: params.operationId,
      prompt,
      resumeSessionId: session.agentSessionId,
      sessionId: session.sessionId,
    });
    session.grokAcpSession = acpSession;

    logger.info('Starting Grok Build ACP session:', {
      commandPath,
      cwd,
      sessionId: session.sessionId,
    });

    try {
      await acpSession.run();
      void this.writeCliTraceJson(traceSession, 'exit.json', {
        finishedAt: new Date().toISOString(),
        transport: 'acp-stdio',
      });
      await this.flushCliTrace(traceSession);
      this.broadcast('heteroAgentSessionComplete', { sessionId: session.sessionId });
    } catch (error) {
      logger.error('Grok Build ACP session error:', error);
      void this.writeCliTraceJson(traceSession, 'process-error.json', {
        message: error instanceof Error ? error.message : String(error),
        name: error instanceof Error ? error.name : 'Error',
        transport: 'acp-stdio',
      });
      await this.flushCliTrace(traceSession);

      if (session.cancelledByUs) {
        this.broadcast('heteroAgentSessionComplete', { sessionId: session.sessionId });
        return;
      }

      const sessionError = this.getSessionErrorPayload(error, session);
      this.broadcast('heteroAgentSessionError', {
        error: sessionError,
        sessionId: session.sessionId,
      });
      throw new Error(typeof sessionError === 'string' ? sessionError : sessionError.message, {
        cause: error,
      });
    } finally {
      await session.hostedProviderBinding?.cleanup();
      if (session.grokAcpSession === acpSession) session.grokAcpSession = undefined;
    }
  }

  private async sendPromptWithCursorAcp(
    params: SendPromptParams,
    session: AgentSession,
  ): Promise<void> {
    const cwd = this.resolveSessionWorkingDirectory(session);
    const spawnEnv = this.buildSessionSpawnEnv(session);
    const commandPath = session.resolvedCommandPath ?? this.resolveSessionCommand(session);
    const promptInput = buildHeterogeneousPrompt({
      imageList: params.imageList,
      prompt: params.prompt,
      systemContext: params.systemContext,
    });
    const prompt = buildCursorAcpPrompt(promptInput);
    const tracePayload = `${JSON.stringify(prompt)}\n`;
    const traceSession = await this.createCliTraceSession({
      cliArgs: buildCursorAcpArgs(session.args),
      cwd,
      imageList: params.imageList ?? [],
      session,
      stdinPayload: tracePayload,
    });
    void this.writeCliTraceFile(traceSession, 'stdin.txt', tracePayload);

    if (session.cancelledByUs) {
      await this.completeCancelledSessionBeforeLaunch(session);
      return;
    }

    const stderrChunks: string[] = [];
    const intervention = this.setupAcpInterventionForOp(
      params.operationId,
      session.sessionId,
      'cursor',
    );
    const cursorAcpSession = new CursorAcpSession({
      args: session.args,
      askUserBridge: intervention.bridge,
      clientVersion: electronApp.getVersion(),
      commandPath,
      cwd,
      env: spawnEnv,
      onEvents: async (events) => {
        for (const event of events) {
          this.broadcast('heteroAgentEvent', { event, sessionId: session.sessionId });
        }
      },
      onRawMessage: (line) => this.appendCliTraceFile(traceSession, 'stdout.jsonl', line),
      onRuntimeStatus: (status) => this.broadcast('heteroAgentRuntimeStatus', status),
      onSessionId: (agentSessionId) => {
        session.agentSessionId = agentSessionId;
      },
      onStderr: (data) => {
        stderrChunks.push(data);
        return this.appendCliTraceFile(traceSession, 'stderr.log', data);
      },
      operationId: params.operationId,
      prompt,
      resumeSessionId: session.agentSessionId,
      sessionId: session.sessionId,
    });
    session.cursorAcpSession = cursorAcpSession;

    await this.runInteractiveAcpSession({
      acpSession: cursorAcpSession,
      activeSessionKey: 'cursorAcpSession',
      cleanup: intervention.cleanup,
      isResumeError: isCursorAcpSessionNotFoundError,
      session,
      stderrChunks,
      traceSession,
      transport: 'cursor-acp',
    });
  }

  private async sendPromptWithDroidAcp(
    params: SendPromptParams,
    session: AgentSession,
  ): Promise<void> {
    const cwd = this.resolveSessionWorkingDirectory(session);
    const spawnEnv = this.buildSessionSpawnEnv(session);
    const commandPath = session.resolvedCommandPath ?? this.resolveSessionCommand(session);
    const promptInput = buildHeterogeneousPrompt({
      imageList: params.imageList,
      prompt: params.prompt,
      systemContext: params.systemContext,
    });
    const prompt = await buildDroidAcpPrompt(promptInput, { cacheDir: this.fileCacheDir });
    const tracePayload = `${JSON.stringify(prompt)}\n`;
    const traceSession = await this.createCliTraceSession({
      cliArgs: buildDroidAcpArgs(session.args),
      cwd,
      imageList: params.imageList ?? [],
      session,
      stdinPayload: tracePayload,
    });
    void this.writeCliTraceFile(traceSession, 'stdin.txt', tracePayload);

    if (session.cancelledByUs) {
      await this.completeCancelledSessionBeforeLaunch(session);
      return;
    }

    const stderrChunks: string[] = [];
    const intervention = this.setupAcpInterventionForOp(
      params.operationId,
      session.sessionId,
      'droid',
    );
    const droidAcpSession = new DroidAcpSession({
      args: session.args,
      askUserBridge: intervention.bridge,
      clientVersion: electronApp.getVersion(),
      commandPath,
      cwd,
      env: spawnEnv,
      initialModel: session.model,
      onEvents: async (events) => {
        for (const event of events) {
          this.broadcast('heteroAgentEvent', { event, sessionId: session.sessionId });
        }
      },
      onModel: (model) => {
        session.model = model;
        session.modelSource = 'droid-acp';
      },
      onRawMessage: (line) => this.appendCliTraceFile(traceSession, 'stdout.jsonl', line),
      onRuntimeStatus: (status) => this.broadcast('heteroAgentRuntimeStatus', status),
      onSessionId: (agentSessionId) => {
        session.agentSessionId = agentSessionId;
      },
      onStderr: (data) => {
        stderrChunks.push(data);
        return this.appendCliTraceFile(traceSession, 'stderr.log', data);
      },
      operationId: params.operationId,
      prompt,
      resumeSessionId: session.agentSessionId,
      sessionId: session.sessionId,
    });
    session.droidAcpSession = droidAcpSession;

    try {
      await droidAcpSession.run();
      void this.writeCliTraceJson(traceSession, 'exit.json', {
        finishedAt: new Date().toISOString(),
        transport: 'droid-acp',
      });
      await this.flushCliTrace(traceSession);
      this.broadcast('heteroAgentSessionComplete', { sessionId: session.sessionId });
    } catch (error) {
      void this.writeCliTraceJson(traceSession, 'process-error.json', {
        message: this.getErrorMessage(error),
        transport: 'droid-acp',
      });
      await this.flushCliTrace(traceSession);
      if (session.cancelledByUs) {
        this.broadcast('heteroAgentSessionComplete', { sessionId: session.sessionId });
        return;
      }
      const stderr = stderrChunks.join('').trim();
      const errorForClassification = isDroidAcpSessionNotFoundError(error)
        ? error
        : stderr
          ? new Error([this.getErrorMessage(error), stderr].filter(Boolean).join('\n'), {
              cause: error,
            })
          : error;
      const sessionError = this.getSessionErrorPayload(errorForClassification, session);
      this.broadcast('heteroAgentSessionError', {
        error: sessionError,
        sessionId: session.sessionId,
      });
      throw new Error(typeof sessionError === 'string' ? sessionError : sessionError.message, {
        cause: error,
      });
    } finally {
      await intervention.cleanup();
      if (session.droidAcpSession === droidAcpSession) session.droidAcpSession = undefined;
    }
  }

  private async sendPromptWithDevinAcp(
    params: SendPromptParams,
    session: AgentSession,
  ): Promise<void> {
    const cwd = this.resolveSessionWorkingDirectory(session);
    const spawnEnv = this.buildSessionSpawnEnv(session);
    const commandPath = session.resolvedCommandPath ?? this.resolveSessionCommand(session);
    const promptInput = buildHeterogeneousPrompt({
      imageList: params.imageList,
      prompt: params.prompt,
      systemContext: params.systemContext,
    });
    const prompt = await buildDevinAcpPrompt(promptInput, { cacheDir: this.fileCacheDir });
    const tracePayload = `${JSON.stringify(prompt)}\n`;
    const traceSession = await this.createCliTraceSession({
      cliArgs: buildDevinAcpArgs(session.args),
      cwd,
      imageList: params.imageList ?? [],
      session,
      stdinPayload: tracePayload,
    });
    void this.writeCliTraceFile(traceSession, 'stdin.txt', tracePayload);

    if (session.cancelledByUs) {
      await this.completeCancelledSessionBeforeLaunch(session);
      return;
    }

    const stderrChunks: string[] = [];
    const intervention = this.setupAcpInterventionForOp(
      params.operationId,
      session.sessionId,
      'devin',
    );
    const devinAcpSession = new DevinAcpSession({
      args: session.args,
      askUserBridge: intervention.bridge,
      clientVersion: electronApp.getVersion(),
      commandPath,
      cwd,
      env: spawnEnv,
      initialModel: session.model,
      onEvents: async (events) => {
        for (const event of events) {
          this.broadcast('heteroAgentEvent', { event, sessionId: session.sessionId });
        }
      },
      onModel: (model) => {
        session.model = model;
        session.modelSource = 'devin-acp';
      },
      onRawMessage: (line) => this.appendCliTraceFile(traceSession, 'stdout.jsonl', line),
      onRuntimeStatus: (status) => this.broadcast('heteroAgentRuntimeStatus', status),
      onSessionId: (agentSessionId) => {
        session.agentSessionId = agentSessionId;
      },
      onStderr: (data) => {
        stderrChunks.push(data);
        return this.appendCliTraceFile(traceSession, 'stderr.log', data);
      },
      operationId: params.operationId,
      prompt,
      resumeSessionId: session.agentSessionId,
      sessionId: session.sessionId,
    });
    session.devinAcpSession = devinAcpSession;

    await this.runInteractiveAcpSession({
      acpSession: devinAcpSession,
      activeSessionKey: 'devinAcpSession',
      cleanup: intervention.cleanup,
      isResumeError: isDevinAcpSessionNotFoundError,
      session,
      stderrChunks,
      traceSession,
      transport: 'devin-acp',
    });
  }

  private async runInteractiveAcpSession({
    acpSession,
    activeSessionKey,
    cleanup,
    isResumeError,
    session,
    stderrChunks,
    traceSession,
    transport,
  }: {
    acpSession: InteractiveAcpSession;
    activeSessionKey:
      'cursorAcpSession' | 'devinAcpSession' | 'standardAcpSession' | 'traeAcpSession';
    cleanup?: () => Promise<void>;
    isResumeError?: (error: unknown) => boolean;
    session: AgentSession;
    stderrChunks: string[];
    traceSession: CliTraceSession | undefined;
    transport: HeterogeneousAgentRuntimeStatus['transport'];
  }): Promise<void> {
    try {
      await acpSession.run();
      void this.writeCliTraceJson(traceSession, 'exit.json', {
        finishedAt: new Date().toISOString(),
        transport,
      });
      await this.flushCliTrace(traceSession);
      this.broadcast('heteroAgentSessionComplete', { sessionId: session.sessionId });
    } catch (error) {
      void this.writeCliTraceJson(traceSession, 'process-error.json', {
        message: this.getErrorMessage(error),
        transport,
      });
      await this.flushCliTrace(traceSession);
      if (session.cancelledByUs) {
        this.broadcast('heteroAgentSessionComplete', { sessionId: session.sessionId });
        return;
      }
      const stderr = stderrChunks.join('').trim();
      const errorForClassification = isResumeError?.(error)
        ? error
        : stderr
          ? new Error([this.getErrorMessage(error), stderr].filter(Boolean).join('\n'), {
              cause: error,
            })
          : error;
      const sessionError = this.getSessionErrorPayload(errorForClassification, session);
      this.broadcast('heteroAgentSessionError', {
        error: sessionError,
        sessionId: session.sessionId,
      });
      throw new Error(typeof sessionError === 'string' ? sessionError : sessionError.message, {
        cause: error,
      });
    } finally {
      await cleanup?.();
      if (activeSessionKey === 'cursorAcpSession' && session.cursorAcpSession === acpSession) {
        session.cursorAcpSession = undefined;
      } else if (activeSessionKey === 'devinAcpSession' && session.devinAcpSession === acpSession) {
        session.devinAcpSession = undefined;
      } else if (activeSessionKey === 'traeAcpSession' && session.traeAcpSession === acpSession) {
        session.traeAcpSession = undefined;
      } else if (
        activeSessionKey === 'standardAcpSession' &&
        session.standardAcpSession === acpSession
      ) {
        session.standardAcpSession = undefined;
      }
    }
  }

  private async sendPromptWithTraeAcp(
    params: SendPromptParams,
    session: AgentSession,
  ): Promise<void> {
    const cwd = this.resolveSessionWorkingDirectory(session);
    const spawnEnv = this.buildSessionSpawnEnv(session);
    const commandPath = session.resolvedCommandPath ?? this.resolveSessionCommand(session);
    const promptInput = buildHeterogeneousPrompt({
      imageList: params.imageList,
      prompt: params.prompt,
      systemContext: params.systemContext,
    });
    const prompt = await buildTraeAcpPrompt(promptInput, { cacheDir: this.fileCacheDir });
    const tracePayload = `${JSON.stringify(prompt)}\n`;
    const traceSession = await this.createCliTraceSession({
      cliArgs: buildTraeAcpArgs(session.args),
      cwd,
      imageList: params.imageList ?? [],
      session,
      stdinPayload: tracePayload,
    });
    void this.writeCliTraceFile(traceSession, 'stdin.txt', tracePayload);

    if (session.cancelledByUs) {
      await this.completeCancelledSessionBeforeLaunch(session);
      return;
    }

    const stderrChunks: string[] = [];

    const traeAcpSession = new TraeAcpSession({
      args: session.args,
      clientVersion: electronApp.getVersion(),
      commandPath,
      cwd,
      env: spawnEnv,
      initialModel: session.model,
      onEvents: async (events) => {
        for (const event of events) {
          this.broadcast('heteroAgentEvent', { event, sessionId: session.sessionId });
        }
      },
      onModel: (model) => {
        session.model = model;
        session.modelSource = 'trae-acp';
      },
      onRawMessage: (line) => this.appendCliTraceFile(traceSession, 'stdout.jsonl', line),
      onRuntimeStatus: (status) => this.broadcast('heteroAgentRuntimeStatus', status),
      onSessionId: (agentSessionId) => {
        session.agentSessionId = agentSessionId;
      },
      onStderr: (data) => {
        stderrChunks.push(data);
        return this.appendCliTraceFile(traceSession, 'stderr.log', data);
      },
      operationId: params.operationId,
      prompt,
      resumeSessionId: session.agentSessionId,
      sessionId: session.sessionId,
    });
    session.traeAcpSession = traeAcpSession;

    await this.runInteractiveAcpSession({
      acpSession: traeAcpSession,
      activeSessionKey: 'traeAcpSession',
      cleanup: async () => {
        await session.hostedProviderBinding?.cleanup();
      },
      session,
      stderrChunks,
      traceSession,
      transport: 'trae-acp',
    });
  }

  /**
   * Localized strings for the ACP interactive permission card. Falls back to
   * the package's English defaults when i18n is not initialized yet (the card
   * still renders — the strings just stay English).
   */
  private getAcpPermissionCardStrings(
    spec: AcpAgentRuntimeSpec | undefined,
  ): { fallbackTitle: string; header: string } | undefined {
    try {
      const label = spec?.label ?? 'the agent';
      return {
        fallbackTitle: this.app.i18n.t('heteroAgent.permission.allowToContinue', {
          label,
          ns: 'common',
        }),
        header: this.app.i18n.t('heteroAgent.permission.header', { ns: 'common' }),
      };
    } catch {
      return undefined;
    }
  }

  /**
   * Shared ACP path for every `ACP_RUNTIME_AGENT_TYPES` agent — native
   * `*-acp` modes (kimi, opencode, qoder, codebuddy) and upstream bridge
   * binaries (claude-agent-acp, codex-acp, amp-acp, pi-acp) alike.
   */
  private async sendPromptWithStandardAcp(
    params: SendPromptParams,
    session: AgentSession,
  ): Promise<void> {
    const agentType = session.agentType;
    const spec = getAcpAgentRuntime(agentType);
    const transport: HeterogeneousAgentRuntimeStatus['transport'] = spec?.transport ?? 'acp-stdio';
    const cwd = this.resolveSessionWorkingDirectory(session);
    const spawnEnv = this.buildSessionSpawnEnv(session);
    const vendorCommand = session.resolvedCommandPath ?? this.resolveSessionCommand(session);

    // Resolve the process that actually speaks ACP: native runtimes keep the
    // vendor command (their `acp`/`--acp` prefix is applied by the session
    // factory); bridge agents probe for the upstream `*-acp` binary and
    // forward the resolved vendor command through the bridge's env contract.
    let target: AcpSpawnTarget;
    try {
      target = await resolveAcpSpawnTarget(agentType, vendorCommand, spawnEnv);
    } catch (error) {
      const sessionError = this.getSessionErrorPayload(error, session);
      this.broadcast('heteroAgentSessionError', {
        error: sessionError,
        sessionId: session.sessionId,
      });
      throw new Error(typeof sessionError === 'string' ? sessionError : sessionError.message, {
        cause: error,
      });
    }

    // Codex rollouts still report cumulative usage; seed the pipeline so a
    // resumed turn continues the counters instead of restarting at zero.
    const initialCumulativeUsage =
      agentType === 'codex' && session.agentSessionId
        ? (await readCodexSessionModel(session.agentSessionId, { env: spawnEnv }))?.cumulativeUsage
        : undefined;

    // Legacy selector flags (`--model`, codex `-c key=value`, …) are lifted
    // onto the ACP session-config surface — bridge binaries own their own
    // argv, so vendor flags can't ride along.
    const selectors = extractStandardAcpSelectors(agentType, session.args);
    const promptInput = buildHeterogeneousPrompt({
      imageList: params.imageList,
      prompt: params.prompt,
      systemContext: params.systemContext,
    });
    let prompt;
    try {
      prompt = await buildStandardAcpPrompt(promptInput, { cacheDir: this.fileCacheDir });
    } catch (error) {
      logger.error(`Failed to prepare ${spec?.label ?? agentType} ACP input:`, error);
      throw new Error(
        `Failed to attach image(s) to ${spec?.label ?? agentType}: ${this.getErrorMessage(error) || 'Unknown error'}`,
        { cause: error },
      );
    }
    const tracePayload = `${JSON.stringify(prompt)}\n`;
    const traceSession = await this.createCliTraceSession({
      cliArgs: [...target.commandArgs, ...buildStandardAcpArgs(agentType, selectors.args)],
      cwd,
      imageList: params.imageList ?? [],
      session,
      stdinPayload: tracePayload,
    });
    void this.writeCliTraceFile(traceSession, 'stdin.txt', tracePayload);

    if (session.cancelledByUs) {
      await this.completeCancelledSessionBeforeLaunch(session);
      return;
    }

    const stderrChunks: string[] = [];
    const intervention = await this.setupStandardAcpInterventionForOp(params.operationId, session, {
      agentId: params.agentId,
      topicId: params.topicId,
    });

    const acpSession = createStandardAcpSession(agentType, {
      args: selectors.args,
      askUserBridge: intervention.bridge,
      clientVersion: electronApp.getVersion(),
      commandArgs: target.commandArgs,
      commandPath: target.commandPath,
      configOptions: selectors.configOptions,
      cwd,
      env: target.env,
      initialCumulativeUsage,
      initialModel: session.model ?? selectors.initialModel,
      mcpServers: intervention.mcpServers,
      onEvents: async (events) => {
        for (const event of events) {
          this.broadcast('heteroAgentEvent', { event, sessionId: session.sessionId });
        }
      },
      onModel: (model) => {
        session.model = model;
        session.modelSource = transport;
      },
      onRawMessage: (line) => this.appendCliTraceFile(traceSession, 'stdout.jsonl', line),
      onRuntimeStatus: (status) => this.broadcast('heteroAgentRuntimeStatus', status),
      onSessionId: (agentSessionId) => {
        session.agentSessionId = agentSessionId;
      },
      onStderr: (data) => {
        stderrChunks.push(data);
        return this.appendCliTraceFile(traceSession, 'stderr.log', data);
      },
      operationId: params.operationId,
      permissionCardStrings: this.getAcpPermissionCardStrings(spec),
      prompt,
      resumeSessionId: session.agentSessionId,
      sessionId: session.sessionId,
      uploadImage: this.uploadResultImage,
    });
    session.standardAcpSession = acpSession;

    await this.runInteractiveAcpSession({
      acpSession,
      activeSessionKey: 'standardAcpSession',
      cleanup: intervention.cleanup,
      isResumeError: isStandardAcpSessionNotFoundError,
      session,
      stderrChunks,
      traceSession,
      transport,
    });
  }

  async getSessionInfo(params: GetSessionInfoParams): Promise<SessionInfo> {
    const session = this.sessions.get(params.sessionId);
    return { agentSessionId: session?.agentSessionId };
  }

  /** Query a heterogeneous CLI's model catalog using the same rules as a real local session. */
  async listModels(
    params: ListHeterogeneousAgentModelsParams,
  ): Promise<HeterogeneousAgentModelCatalog> {
    const env = {
      ...buildInheritedSpawnEnv(),
      ...buildProxyEnv(this.app.storeManager.get('networkProxy')),
      ...params.env,
    };

    return listHeterogeneousAgentModels({
      ...params,
      cwd: params.cwd || electronApp.getPath('desktop'),
      env,
    });
  }

  async getCodexQuota(params: GetCodexQuotaParams = {}): Promise<CodexQuotaSnapshot> {
    const command = params.command?.trim() || 'codex';
    const sourceEnv = {
      ...buildProxyEnv(this.app.storeManager.get('networkProxy')),
      ...params.env,
    };
    const sourceKey = createQuotaCacheKey('codex', command, sourceEnv);

    return this.codexQuotaCache.get(
      sourceKey,
      async () => {
        const status = await detectHeterogeneousCliCommand('codex', command);
        const env = {
          ...(status.resolvedPathEnv ? { PATH: status.resolvedPathEnv } : {}),
          ...sourceEnv,
        };

        return fetchCodexQuota({
          command: status.available && status.path ? status.path : command,
          env: Object.keys(env).length > 0 ? env : undefined,
        });
      },
      { force: params.force },
    );
  }

  /**
   * Redeem one earned Codex rate-limit reset, then bypass the quota cache so
   * every renderer receives the post-reset windows and remaining inventory.
   */
  async consumeCodexRateLimitResetCredit(
    params: ConsumeCodexRateLimitResetCreditParams,
  ): Promise<CodexRateLimitResetResult> {
    const command = params.command?.trim() || 'codex';
    const sourceEnv = {
      ...buildProxyEnv(this.app.storeManager.get('networkProxy')),
      ...params.env,
    };
    const sourceKey = createQuotaCacheKey('codex', command, sourceEnv);
    const status = await detectHeterogeneousCliCommand('codex', command);
    const env = {
      ...(status.resolvedPathEnv ? { PATH: status.resolvedPathEnv } : {}),
      ...sourceEnv,
    };
    const requestOptions = {
      command: status.available && status.path ? status.path : command,
      env: Object.keys(env).length > 0 ? env : undefined,
    };

    const outcome = await consumeCodexRateLimitResetCreditRequest({
      ...requestOptions,
      creditId: params.creditId,
      idempotencyKey: params.idempotencyKey,
    });
    this.codexQuotaCache.invalidate(sourceKey);
    const quota = await this.codexQuotaCache.get(sourceKey, () => fetchCodexQuota(requestOptions), {
      force: true,
    });

    return { outcome, quota };
  }

  /**
   * Read the Claude Code subscription quota. No CLI is spawned: the quota
   * comes from Anthropic's OAuth usage API using the local `claude` login,
   * and the request goes through the app's global proxy dispatcher.
   */
  /**
   * Identity of the Claude login a spawn with this env would use. Pure local
   * file read (`.claude.json` of the resolved profile) — cheap enough to call
   * once per run for usage→account attribution; never touches the network.
   */
  async getClaudeCodeIdentity(params: { env?: Record<string, string> } = {}) {
    return readClaudeCodeIdentity({ env: params.env });
  }

  async getClaudeCodeQuota(
    params: GetClaudeCodeQuotaParams = {},
  ): Promise<ClaudeCodeQuotaSnapshot> {
    const sourceKey = createQuotaCacheKey('claude-code', params.env);

    return this.claudeCodeQuotaCache.get(
      sourceKey,
      () => fetchClaudeCodeQuota({ env: params.env }),
      { force: params.force },
    );
  }

  /**
   * Signal the whole process tree spawned by this session.
   *
   * On Unix the child was spawned with `detached: true`, so negating the pid
   * signals the process group — reaching tool subprocesses (bash, grep, etc.)
   * that would otherwise orphan after a parent-only kill. Falls back to the
   * direct signal if the group kill raises (ESRCH when the leader is already
   * gone). On Windows we shell out to `taskkill /T /F` which walks the tree.
   */
  private killProcessTree(proc: ChildProcess, signal: NodeJS.Signals): void {
    if (!proc.pid || proc.killed) return;

    if (process.platform === 'win32') {
      try {
        spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
      } catch (err) {
        logger.warn('taskkill failed:', err);
      }
      return;
    }

    try {
      process.kill(-proc.pid, signal);
    } catch {
      try {
        proc.kill(signal);
      } catch {
        // already exited
      }
    }
  }

  private isProcessGroupAlive(pid: number): boolean {
    try {
      process.kill(-pid, 0);
      return true;
    } catch (error) {
      return (error as NodeJS.ErrnoException).code !== 'ESRCH';
    }
  }

  private async waitForProcessTreeExit(
    task: LhHeteroExecTask,
    timeoutMs: number,
  ): Promise<boolean> {
    if (process.platform === 'win32') {
      let timer: NodeJS.Timeout | undefined;
      const timedOut = new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      });
      const exited = await Promise.race([task.exit.then(() => true as const), timedOut]);
      if (timer) clearTimeout(timer);
      return exited;
    }
    if (!task.process.pid) return true;

    const deadline = Date.now() + timeoutMs;
    while (this.isProcessGroupAlive(task.process.pid)) {
      if (Date.now() >= deadline) return false;
      await sleep(50);
    }

    return true;
  }

  /**
   * Cancels an ongoing heterogeneous-agent session. Every transport is an ACP
   * session, so interruption means `session/cancel` (SIGINT semantics) —
   * the session force-closes itself if the agent ignores the cancel.
   *
   * Call stack:
   *
   * QueueTray.handleSendNow
   *   -> cancelOperation
   *     -> renderer onOperationCancel hook
   *       -> {@link HeterogeneousAgentCtr.cancelSession}
   *         -> AcpAgentSession.interrupt()
   *
   * Use when:
   * - The user stops an active local heterogeneous-agent run.
   * - “Send now” must safely resume the same native Codex thread.
   *
   * Expects:
   * - `params.sessionId` identifies a session owned by this controller.
   */
  async cancelSession(params: CancelSessionParams): Promise<void> {
    const session = this.sessions.get(params.sessionId);
    if (!session) return;

    session.cancelledByUs = true;
    const acpSession =
      session.devinAcpSession ??
      session.grokAcpSession ??
      session.cursorAcpSession ??
      session.droidAcpSession ??
      session.traeAcpSession ??
      session.standardAcpSession;
    if (acpSession) {
      // A cancelled run must be confirmed dead before the renderer may send a
      // replacement prompt into the same worktree — `interrupt()` only reports
      // confirmed once the child actually exited (grace → SIGTERM → SIGKILL).
      const exited = await acpSession.interrupt();
      if (!exited) {
        throw new Error(`Session ${params.sessionId} did not exit after cancellation escalation`);
      }
      return;
    }

    await session.hostedProviderBinding?.cleanup();
  }

  /**
   * Stop and clean up a session.
   */
  async stopSession(params: StopSessionParams): Promise<void> {
    const session = this.sessions.get(params.sessionId);
    if (!session) return;

    if (session.devinAcpSession) {
      session.cancelledByUs = true;
      session.devinAcpSession.close();
    }

    if (session.grokAcpSession) {
      session.cancelledByUs = true;
      session.grokAcpSession.close();
    }

    if (session.cursorAcpSession) {
      session.cancelledByUs = true;
      session.cursorAcpSession.close();
    }

    if (session.droidAcpSession) {
      session.cancelledByUs = true;
      session.droidAcpSession.close();
    }

    if (session.traeAcpSession) {
      session.cancelledByUs = true;
      session.traeAcpSession.close();
    }

    if (session.standardAcpSession) {
      session.cancelledByUs = true;
      session.standardAcpSession.close();
    }

    await session.hostedProviderBinding?.cleanup();
    this.sessions.delete(params.sessionId);
  }

  async respondPermission(): Promise<void> {
    // No-op for CLI mode (permissions handled by --permission-mode flag)
  }

  /**
   * Renderer → main: deliver the user's answer to a pending CC AskUserQuestion
   * (or signal cancellation). The matching bridge resolves its blocked
   * `pending()` Promise, the local MCP handler returns to CC, and CC's
   * `tool_result` flows back through the normal stream pipeline.
   *
   * Idempotent — late submissions for already-resolved tool calls are no-ops.
   * No-op when called for an unknown opId; the bridge may have been cleaned
   * up already (op finished / cancelled).
   */
  async submitIntervention(params: SubmitInterventionParams): Promise<void> {
    const slot = this.opIdToIntervention.get(params.operationId);
    if (!slot) {
      logger.warn('submitIntervention: no active intervention for operationId', params.operationId);
      return;
    }
    slot.bridge.resolve(params.toolCallId, {
      cancelReason: params.cancelled ? (params.cancelReason ?? 'user_cancelled') : undefined,
      cancelled: params.cancelled,
      result: params.result,
    });
  }

  /**
   * Cleanup on app quit. `before-quit` covers the user-driven Cmd+Q /
   * `app.quit()` path; SIGTERM / SIGINT cover external kills (test
   * harnesses, OS shutdown) where Electron's lifecycle events never fire.
   */
  afterAppReady() {
    electronApp.on('before-quit', () => {
      for (const [, session] of this.sessions) {
        session.hostedProviderBinding?.cleanupSync();
        if (session.devinAcpSession) {
          session.cancelledByUs = true;
          session.devinAcpSession.close();
        }
        if (session.grokAcpSession) {
          session.cancelledByUs = true;
          session.grokAcpSession.close();
        }
        if (session.cursorAcpSession) {
          session.cancelledByUs = true;
          session.cursorAcpSession.close();
        }
        if (session.droidAcpSession) {
          session.cancelledByUs = true;
          session.droidAcpSession.close();
        }
        if (session.traeAcpSession) {
          session.cancelledByUs = true;
          session.traeAcpSession.close();
        }
        if (session.standardAcpSession) {
          session.cancelledByUs = true;
          session.standardAcpSession.close();
        }
      }
      this.sessions.clear();
      // The exit handlers will tear each per-op intervention down, but if
      // CC's stdio close races shutdown we'd leave the MCP server bound to
      // a port. Stopping it here cancels every still-pending bridge with
      // `session_ended` and closes the listener.
      void this.builtinMcpServer?.stop().catch((err) => {
        logger.warn('AskUserQuestion MCP server stop error:', err);
      });
    });

    const onSignal = (signal: NodeJS.Signals) => {
      // Defer to Electron's normal quit flow so the rest of the app gets a
      // chance to tear down. The `before-quit` handler above is idempotent.
      try {
        electronApp.quit();
      } catch {
        /* during late shutdown app.quit may throw — fine */
      }
      // Last-resort exit if Electron is wedged and won't quit on its own.
      setTimeout(() => process.exit(signal === 'SIGINT' ? 130 : 143), 1000).unref();
    };
    process.on('SIGTERM', onSignal);
    process.on('SIGINT', onSignal);
  }

  /**
   * Spawn the embedded CLI's `hetero exec` for gateway-driven agent runs.
   * The bundled CLI handles everything downstream — no local
   * AgentStreamPipeline or IPC broadcast needed. Mirrors
   * `spawnHeteroSandbox()` on the server side.
   *
   * Resolves only after the child either starts or fails to start. Node reports
   * failures such as an inaccessible cwd asynchronously through `error`, so an
   * eager accepted ack would strand the server operation without a producer.
   */
  spawnLhHeteroExec(params: {
    agentType: string;
    assistantMessageId?: string;
    /** Resolved `lh hetero exec` wrapper args. */
    args?: string[];
    /** Server-backed builtin tool surface for the per-run `orvilo_cc` MCP server. */
    builtinTools?: AcpBuiltinToolSpec[];
    cwd?: string;
    /** Image attachments (signed URLs) appended as image content blocks. */
    imageList?: HeteroExecImageRef[];
    jwt: string;
    operationId: string;
    /**
     * The operation-scoped token from the dispatch (carries `hetero:tool:exec`
     * when builtin tools are mounted). The caller often substitutes `jwt` with
     * the device's own user token for ingest/finish, so the op token travels
     * separately and the CLI prefers it for `execBuiltinTool` callbacks.
     */
    operationJwt?: string;
    prompt: string;
    resumeFallbackSystemContext?: string;
    resumeSessionId?: string;
    /** Admission fence relayed to `lh hetero exec` via `ORVILO_RUN_GENERATION`. */
    runGeneration?: number;
    serverUrl: string;
    systemContext?: string;
    topicId: string;
    /** Topic/run workspace — forwarded as `ORVILO_WORKSPACE_ID` for ingest. */
    workspaceId?: string;
    /**
     * Called once the child process has spawned (pid available). The caller
     * (gateway dispatcher) uses this to register the process so a later
     * `cancelHeteroTask` can kill it by operationId.
     */
    onChildSpawned?: (child: ChildProcess) => void;
  }): Promise<{ reason?: string; status: 'accepted' | 'rejected' }> {
    const {
      agentType,
      assistantMessageId,
      args: extraArgs,
      builtinTools,
      cwd,
      imageList,
      jwt,
      operationId,
      operationJwt,
      onChildSpawned,
      prompt,
      resumeFallbackSystemContext,
      resumeSessionId,
      runGeneration,
      serverUrl,
      systemContext,
      topicId,
      workspaceId,
    } = params;
    const workDir = cwd ?? process.cwd();
    // Let the embedded CLI classify a stale project path and finish the
    // operation through heteroFinish instead of failing this wrapper spawn as
    // the misleading `spawn Orvilo.exe ENOENT`.
    const workDirUsable = isSpawnableDirectory(workDir);
    const spawnCwd = resolveHeteroSpawnCwd(workDir);

    // When CLI tracing is enabled (dev builds, or the Help-menu toggle in
    // packaged builds), have `lh hetero exec` persist the agent process's RAW
    // ACP wire stream (pre-adapter) on this device. The remote-device path
    // otherwise leaves no local record — the CLI consumes stdout internally and
    // only POSTs adapted events to the server — so without this there's nothing
    // to inspect when a remote run misbehaves. Do not pass a cwd-relative dump
    // path for a missing workDir: RawStreamDump would recreate the deleted
    // directory before spawnAgent can report it.
    const rawDumpDir =
      this.shouldTraceCliOutput && workDirUsable ? this.resolveTraceRootDir(workDir) : undefined;

    const args = [
      'hetero',
      'exec',
      '--type',
      agentType,
      '--operation-id',
      operationId,
      '--topic',
      topicId,
      '--render',
      'none',
      '--input-json',
      '-',
      '--cwd',
      workDir,
      ...(resumeSessionId ? ['--resume', resumeSessionId] : []),
      ...(rawDumpDir ? ['--raw-dump', rawDumpDir] : []),
      ...(extraArgs ?? []),
    ];

    const stdinPayload = buildHeteroExecStdinPayload({
      imageList,
      prompt,
      resumeFallbackSystemContext,
      systemContext,
    });
    const cliScript = resolveCliScript();
    if (!existsSync(cliScript)) {
      return Promise.resolve({
        reason: `Embedded CLI not found at ${cliScript}`,
        status: 'rejected',
      });
    }

    const env = {
      ...process.env,
      ...buildProxyEnv(this.app.storeManager.get('networkProxy')),
      ELECTRON_RUN_AS_NODE: '1',
      [HETERO_EXEC_INHERIT_PROCESS_GROUP_ENV]: '1',
      ORVILO_JWT: jwt,
      // The operation-scoped token (with `hetero:tool:exec` when the run mounts
      // builtin tools) travels separately: `ORVILO_JWT` here is often the
      // device's own user token, which the execBuiltinTool endpoint would
      // reject for lacking the capability.
      ...(operationJwt ? { ORVILO_OPERATION_JWT: operationJwt } : {}),
      ...(builtinTools?.length
        ? {
            ORVILO_BUILTIN_TOOLS: Buffer.from(JSON.stringify(builtinTools)).toString('base64'),
          }
        : {}),
      ...(assistantMessageId ? { ORVILO_ASSISTANT_MESSAGE_ID: assistantMessageId } : {}),
      ...(runGeneration != null ? { ORVILO_RUN_GENERATION: String(runGeneration) } : {}),
      ORVILO_SERVER: serverUrl,
      // Same reason `runHeteroTask` injects this for notify: without it the
      // CLI's heteroIngest/heteroFinish fall back to personal scope and the
      // workspace topic 404s (empty assistant, topic stuck `running`).
      ...(workspaceId ? { ORVILO_WORKSPACE_ID: workspaceId } : {}),
    };

    logger.info('spawnLhHeteroExec: type=%s op=%s topic=%s', agentType, operationId, topicId);

    // Execute the CLI shipped with this desktop build. A bare `lh` would prefer
    // an older global install earlier on PATH, letting model discovery report a
    // capability that the actual execution runtime does not support.
    // `detached: true` puts the CLI in its own process group so
    // `killPlatformProcessTree(-pid, signal)` reaches the CLI and its children;
    // the inherited-group env contract prevents the inner agent from detaching
    // into a second, unreachable group.
    const child = spawn(process.execPath, [cliScript, ...args], {
      cwd: spawnCwd,
      detached: true,
      env,
      stdio: ['pipe', 'inherit', 'inherit'],
      windowsHide: true,
    });

    // Keep the wrapper reachable by the gateway cancellation tool. Its pid is
    // also the inherited process-group id shared by the native agent and tool
    // descendants, so the gateway can confirm the complete writer tree exited
    // before a replacement turn starts.
    const exit = new Promise<void>((resolve) => {
      child.once('exit', () => resolve());
      child.once('error', () => resolve());
    });
    this.lhHeteroExecTasks.set(operationId, { exit, process: child });

    child.on('exit', (code, signal) => {
      logger.info('spawnLhHeteroExec: exited — op=%s code=%s signal=%s', operationId, code, signal);
      if (this.lhHeteroExecTasks.get(operationId)?.process === child) {
        this.lhHeteroExecTasks.delete(operationId);
      }
    });

    child.on('error', () => {
      if (this.lhHeteroExecTasks.get(operationId)?.process === child) {
        this.lhHeteroExecTasks.delete(operationId);
      }
    });

    return new Promise((resolve) => {
      let settled = false;
      const settle = (result: { reason?: string; status: 'accepted' | 'rejected' }) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      child.stdin.once('error', (err) => {
        logger.error(
          'spawnLhHeteroExec: stdin write failed — op=%s error=%s',
          operationId,
          err.message,
        );
        settle({ reason: err.message, status: 'rejected' });
      });

      child.once('spawn', () => {
        // Register the child with the gateway's platform task registry so a
        // later `cancelHeteroTask` (triggered by the user clicking Stop in the
        // web UI) can find and kill this process by operationId. Without this
        // the CLI keeps running after the user cancels — the server only marks
        // its own operation state as interrupted, never signalling the device.
        onChildSpawned?.(child);
        try {
          child.stdin.write(stdinPayload);
          child.stdin.end();
          settle({ status: 'accepted' });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          logger.error(
            'spawnLhHeteroExec: stdin write threw — op=%s error=%s',
            operationId,
            reason,
          );
          settle({ reason, status: 'rejected' });
        }
      });

      child.once('error', (err) => {
        logger.error('spawnLhHeteroExec: spawn failed — %s', err.message);
        settle({ reason: err.message, status: 'rejected' });
      });
    });
  }

  /**
   * Cancels a device-gateway `lh hetero exec` wrapper and waits for its native
   * writer to exit.
   *
   * Use when:
   * - A server operation is interrupted from another client.
   * - A replacement turn must not resume the same native thread concurrently.
   *
   * Expects:
   * - `operationId` is the id supplied to {@link spawnLhHeteroExec}.
   *
   * Returns:
   * - Process details when a live wrapper was found; otherwise `undefined`.
   */
  async cancelLhHeteroExec(params: {
    operationId: string;
    signal?: HeterogeneousAgentCancellationSignal;
  }): Promise<LhHeteroExecCancellationResult | undefined> {
    const { operationId, signal = 'SIGINT' } = params;
    const task = this.lhHeteroExecTasks.get(operationId);
    if (!task) return;
    if (task.cancellation) return task.cancellation;

    task.cancellation = (async () => {
      this.killProcessTree(task.process, signal);
      let exited = await this.waitForProcessTreeExit(task, 2000);

      if (!exited) {
        // The wrapper and native agent inherit one detached group. Escalate that
        // complete group instead of relying on a second wrapper-only SIGINT.
        this.killProcessTree(task.process, 'SIGKILL');
        exited = await this.waitForProcessTreeExit(task, 3000);
      }

      return { exited, pid: task.process.pid, signal };
    })();

    return task.cancellation;
  }
}
