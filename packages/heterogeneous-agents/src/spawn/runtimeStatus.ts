/**
 * Runtime status reported by every heterogeneous agent session
 * (ACP stdio sessions, CLI spawns, and any vendor-managed transports).
 *
 * Lives in its own module so the shared ACP base (`acpAgentSession`) and the
 * Codex thread session do not depend on the Claude SDK session file — the
 * types are vendor-neutral.
 */
export type HeterogeneousAgentRuntimeState =
  'starting' | 'running' | 'monitoring' | 'idle' | 'stale' | 'closing' | 'closed' | 'error';

export interface HeterogeneousAgentRuntimeTask {
  description?: string;
  lastEventAt: number;
  startedAt: number;
  taskId: string;
  toolUseId?: string;
  type?: string;
}

export interface HeterogeneousAgentRuntimeStatus {
  activeTasks: HeterogeneousAgentRuntimeTask[];
  idleDeadlineAt?: number;
  lastEventAt: number;
  operationId?: string;
  sessionId: string;
  staleDeadlineAt?: number;
  state: HeterogeneousAgentRuntimeState;
  transport:
    | 'acp-stdio'
    | 'amp-acp'
    | 'claude-code-acp'
    | 'claude-sdk'
    | 'cli-spawn'
    | 'codebuddy-acp'
    | 'codex-acp'
    | 'codex-app-server'
    | 'cursor-acp'
    | 'droid-acp'
    | 'devin-acp'
    | 'kimi-code-acp'
    | 'opencode-acp'
    | 'pi-acp'
    | 'qoder-acp'
    | 'trae-acp';
}
