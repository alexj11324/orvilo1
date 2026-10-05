import { isDesktop } from '@orvilo/const';
import type {
  ClaudeCodeQuotaSnapshot,
  CodexQuotaSnapshot,
  CodexRateLimitResetResult,
} from '@orvilo/electron-client-ipc';
import type { HeterogeneousProviderBindingReference } from '@orvilo/heterogeneous-agents';
import type {
  HeterogeneousAgentModelCatalog,
  HeterogeneousAgentPermission,
  HeterogeneousAgentPermissionCatalog,
  HeteroSessionImportMessage,
  ListHeterogeneousAgentModelsParams,
  ListHeterogeneousAgentPermissionsParams,
} from '@orvilo/types';

import { requireProvenLocalDeviceId } from '@/services/localExecutionIdentity';
import { ensureElectronIpc } from '@/utils/electron/ipc';

/**
 * Renderer-side service for managing heterogeneous agent processes via Electron IPC.
 */
class HeterogeneousAgentService {
  /** Local discovery UI availability only; this never proves device identity or execution admission. */
  get supportsLocalExecution(): boolean {
    return isDesktop;
  }

  private get ipc() {
    return ensureElectronIpc();
  }

  async startSession(params: {
    agentType?: string;
    args?: string[];
    command: string;
    cwd?: string;
    env?: Record<string, string>;
    initialModel?: string;
    initialPermission?: HeterogeneousAgentPermission;
    providerBinding?: HeterogeneousProviderBindingReference;
    resumeSessionId?: string;
    useClaudeCodeSdk?: boolean;
    useCodexAppServer?: boolean;
  }) {
    await requireProvenLocalDeviceId('startSession');
    return this.ipc.heterogeneousAgent.startSession(params);
  }

  async sendPrompt(params: {
    agentId?: string;
    imageList?: Array<{ id: string; url: string }>;
    operationId: string;
    prompt: string;
    /** Prior turns used to rebuild a GC-ed Claude Code transcript before `--resume`. */
    resumeReplayMessages?: HeteroSessionImportMessage[];
    sessionId: string;
    systemContext?: string;
    topicId?: string;
  }) {
    await requireProvenLocalDeviceId('sendPrompt');
    return this.ipc.heterogeneousAgent.sendPrompt(params);
  }

  async cancelSession(sessionId: string) {
    await requireProvenLocalDeviceId('cancelSession');
    return this.ipc.heterogeneousAgent.cancelSession({ sessionId });
  }

  async stopSession(sessionId: string) {
    await requireProvenLocalDeviceId('stopSession');
    return this.ipc.heterogeneousAgent.stopSession({ sessionId });
  }

  async getSessionInfo(sessionId: string) {
    await requireProvenLocalDeviceId('getSessionInfo');
    return this.ipc.heterogeneousAgent.getSessionInfo({ sessionId });
  }

  async listPermissions(
    params: ListHeterogeneousAgentPermissionsParams,
  ): Promise<HeterogeneousAgentPermissionCatalog[]> {
    await requireProvenLocalDeviceId('listPermissions');
    return this.ipc.heterogeneousAgent.listPermissions(params);
  }

  async listModels(
    params: ListHeterogeneousAgentModelsParams,
  ): Promise<HeterogeneousAgentModelCatalog> {
    await requireProvenLocalDeviceId('listModels');
    return this.ipc.heterogeneousAgent.listModels(params);
  }

  async getCodexQuota(params?: {
    command?: string;
    env?: Record<string, string>;
    force?: boolean;
  }): Promise<CodexQuotaSnapshot> {
    await requireProvenLocalDeviceId('getCodexQuota');
    return this.ipc.heterogeneousAgent.getCodexQuota(params);
  }

  async consumeCodexRateLimitResetCredit(params: {
    command?: string;
    creditId?: string;
    env?: Record<string, string>;
    idempotencyKey: string;
  }): Promise<CodexRateLimitResetResult> {
    await requireProvenLocalDeviceId('consumeCodexRateLimitResetCredit');
    return this.ipc.heterogeneousAgent.consumeCodexRateLimitResetCredit(params);
  }

  async getClaudeCodeQuota(params?: {
    env?: Record<string, string>;
    force?: boolean;
  }): Promise<ClaudeCodeQuotaSnapshot> {
    await requireProvenLocalDeviceId('getClaudeCodeQuota');
    return this.ipc.heterogeneousAgent.getClaudeCodeQuota(params);
  }

  /**
   * Identity of the Claude login a spawn with this env would use — a pure
   * local file read, safe to call once per run for usage attribution.
   */
  async getClaudeCodeIdentity(params?: {
    env?: Record<string, string>;
  }): Promise<ClaudeCodeQuotaSnapshot['identity']> {
    await requireProvenLocalDeviceId('getClaudeCodeIdentity');
    return this.ipc.heterogeneousAgent.getClaudeCodeIdentity(params);
  }

  /**
   * Submit the user's answer (or cancellation) for a pending CC
   * AskUserQuestion intervention. The main process routes it to the
   * matching MCP bridge so the blocked tool handler can return to CC.
   */
  async submitIntervention(params: {
    cancelReason?: 'timeout' | 'user_cancelled';
    cancelled?: boolean;
    operationId: string;
    result?: unknown;
    toolCallId: string;
  }) {
    await requireProvenLocalDeviceId('submitIntervention');
    return this.ipc.heterogeneousAgent.submitIntervention(params);
  }
}

export const heterogeneousAgentService = new HeterogeneousAgentService();
