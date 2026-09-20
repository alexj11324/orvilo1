import type {
  ClaudeCodeAccountIdentity,
  ClaudeCodeQuotaReading,
} from '@orvilo/electron-client-ipc';

import { lambdaClient } from '@/libs/trpc/client';

/**
 * Renderer-side service for the account-scoped quota data layer (persisted via
 * the lambda tRPC → server DB). Distinct from `heterogeneousAgentService`, which
 * fetches the *live* quota from the local CLI login over Electron IPC.
 */
class AgentQuotaService {
  /** Persist a live Claude snapshot (identity + readings) captured over IPC. */
  ingestClaudeSnapshot = async (params: {
    deviceId?: string;
    identity: ClaudeCodeAccountIdentity;
    readings: ClaudeCodeQuotaReading[];
  }) =>
    lambdaClient.agentQuota.ingestSnapshot.mutate({
      deviceId: params.deviceId,
      identity: params.identity,
      provider: 'claude-code',
      readings: params.readings.map((r) => ({ ...r, scopeKey: r.scopeKey ?? '' })),
    });

  listAccounts = async () => lambdaClient.agentQuota.listAccounts.query();

  /**
   * Newest reading per limit bucket — what the panel renders. Windows are keyed
   * by `resets_at`, so a limit reported without one (an untouched model-scoped
   * weekly) only exists here.
   */
  getLatestReadings = async (accountId: string) =>
    lambdaClient.agentQuota.getLatestReadings.query({ accountId });

  /** Recent concrete windows (weekly + session), newest reset first — calendar read model. */
  getWindows = async (accountId: string, limit?: number) =>
    lambdaClient.agentQuota.getWindows.query({ accountId, limit });

  /** Full reading series (oldest first) for the burn-down chart / calendar heat. */
  listSnapshots = async (accountId: string, sinceDays?: number) =>
    lambdaClient.agentQuota.listSnapshots.query({ accountId, sinceDays });

  /** Per-turn token + cost spend (oldest first) for the calendar's daily totals. */
  listUsageTurns = async (accountId: string, sinceDays?: number) =>
    lambdaClient.agentQuota.listUsageTurns.query({ accountId, sinceDays });

  /** One assistant turn's consumption → usage ledger (idempotent by message id). */
  recordUsage = async (params: {
    agentId?: string;
    externalAccountId?: string;
    messageId?: string;
    model?: string;
    occurredAt?: number;
    operationId?: string;
    provider: 'claude-code' | 'codex';
    topicId?: string;
    usage: {
      cacheRead?: number;
      cacheWrite5m?: number;
      input?: number;
      output?: number;
      reasoning?: number;
    };
  }) => lambdaClient.agentQuota.recordUsage.mutate(params);
}

export const agentQuotaService = new AgentQuotaService();
