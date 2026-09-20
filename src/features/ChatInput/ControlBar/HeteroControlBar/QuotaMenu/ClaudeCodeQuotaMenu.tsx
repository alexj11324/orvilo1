'use client';

import type { ClaudeCodeQuotaSnapshot } from '@orvilo/electron-client-ipc';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { agentQuotaService } from '@/services/agentQuota';
import { fetchClaudeCodeQuotaSnapshot } from '@/services/heteroAgentQuota';

import QuotaAccountIdentity from './QuotaAccountIdentity';
import type { FetchQuotaOptions, QuotaWindowItem } from './QuotaMenu';
import QuotaMenu, { createQuotaSourceKey } from './QuotaMenu';
import type { ClaudeCodePanelSnapshot } from './quotaViewModel';
import {
  buildClaudePanelSnapshot,
  hasRenderableWindow,
  isObservableQuotaAccount,
  isQuotaStale,
  newestCapturedAt,
  pruneQuotaIdentityTrust,
  trustedQuotaIdentity,
  trustQuotaIdentity,
} from './quotaViewModel';

/**
 * Hit the live Anthropic usage API when the newest persisted reading is this
 * stale, and auto-refresh on the same cadence so the badge stays near-live.
 * The sampler-side snapshot cache (90 s fresh window in the desktop main
 * process / device host) is what actually protects the rate-limited usage
 * endpoint.
 */
const QUOTA_REFRESH_MS = 2 * 60 * 1000;

const createErrorSnapshot = (error: unknown): ClaudeCodePanelSnapshot => ({
  error: error instanceof Error ? error.message : String(error),
  provider: 'claude-code',
  scopedWeekly: null,
  session: null,
  status: 'error',
  updatedAt: Date.now(),
  weekly: null,
});

const unavailableSnapshot = (
  reason?: ClaudeCodeQuotaSnapshot['reason'],
): ClaudeCodePanelSnapshot => ({
  error: null,
  provider: 'claude-code',
  reason,
  scopedWeekly: null,
  session: null,
  status: 'unavailable',
  updatedAt: Date.now(),
  weekly: null,
});

const isRateLimitError = (quota: ClaudeCodeQuotaSnapshot) => quota.error?.includes('429') ?? false;

interface ClaudeCodeQuotaMenuProps {
  /** Bound execution device to sample instead of the local desktop login. */
  deviceId?: string;
  env?: Record<string, string>;
}

const ClaudeCodeQuotaMenu = memo<ClaudeCodeQuotaMenuProps>(({ deviceId, env }) => {
  const { t } = useTranslation('chat');
  // The observation source is the execution context itself — provider +
  // execution device (or 'local') + CLI profile env. Identity bindings are
  // recorded per context, so switching device or profile can never inherit a
  // binding confirmed elsewhere.
  const sourceKey = createQuotaSourceKey('claude-code', deviceId ?? 'local', env);

  /**
   * DB-first: render the persisted windows from our own database, and go to the
   * live Anthropic usage API to refresh + ingest when the newest persisted
   * reading is older than QUOTA_REFRESH_MS, the caller revalidates (focus /
   * popover open), or the user forces it. The persisted snapshot paints first
   * through onInterim, so the panel shows data instantly and survives a failing
   * live fetch.
   *
   * The persisted view is only reachable for the provider identity this
   * execution context already confirmed via a live sample — there is no
   * first-row fallback, so a device/profile switch or a failed ingest can never
   * paint another login's history under this run's name.
   */
  const fetchQuota = useCallback(
    async (
      options?: FetchQuotaOptions<ClaudeCodePanelSnapshot>,
    ): Promise<ClaudeCodePanelSnapshot> => {
      const force = !!options?.force;

      // 1) Resolve the account to display — only via the identity this context
      // confirmed. Rows that fell out of the visible set (revoked, another
      // workspace) also drop their trust binding, so stale trust can never
      // paint a borrowed window. A failed list fetch skips the prune: it proves
      // nothing about visibility and would wipe still-valid bindings.
      const accountRows = await agentQuotaService.listAccounts().catch(() => null);
      let claude = (accountRows ?? []).filter((a) => isObservableQuotaAccount(a, 'claude-code'));
      if (accountRows) {
        pruneQuotaIdentityTrust(
          new Set(
            claude
              .map((a) => a.externalAccountId)
              .filter((id): id is string => typeof id === 'string' && id.length > 0),
          ),
        );
      }
      const trustedExternalAccountId = trustedQuotaIdentity(sourceKey);
      let account = trustedExternalAccountId
        ? claude.find((a) => a.externalAccountId === trustedExternalAccountId)
        : undefined;
      let readings = account
        ? await agentQuotaService.getLatestReadings(account.id).catch(() => [])
        : [];

      // 2) Throttled live refresh + ingest. Paint the persisted windows before
      // awaiting the live fetch so the panel never blocks on it. Until an
      // identity is confirmed for this context the sampler is always consulted
      // — a persisted row alone cannot prove it belongs to this run.
      let live: ClaudeCodeQuotaSnapshot | null = null;
      let persistenceFailed = false;
      if (
        force ||
        options?.revalidate ||
        !account ||
        isQuotaStale(account.updatedAt, Date.now(), QUOTA_REFRESH_MS)
      ) {
        if (account && readings.length > 0) {
          const interim = buildClaudePanelSnapshot(account, readings, null);
          if (hasRenderableWindow(interim)) options?.onInterim?.(interim);
        }
        live = await fetchClaudeCodeQuotaSnapshot({ deviceId, env, force }).catch(() => null);

        if (live?.status === 'ok' && live.identity?.externalAccountId) {
          const liveExternalAccountId = live.identity.externalAccountId;
          // The live sample is authoritative for who this context runs as —
          // rebind even when it carries no flat readings to persist, so a
          // login switch on the device immediately drops the previous account.
          trustQuotaIdentity(sourceKey, liveExternalAccountId);
          const matchingAccount = claude.find(
            (candidate) => candidate.externalAccountId === liveExternalAccountId,
          );

          if (live.readings?.length) {
            // A revalidation inside the main-process cache's fresh window gets
            // the readings we already persisted echoed back (same capturedAt).
            // Snapshots are append-only, so re-ingesting an echo would
            // duplicate history rows and rerun calibration without new
            // evidence — skip it.
            const liveCapturedAt = live.readings.reduce(
              (max, r) => Math.max(max, r.capturedAt),
              0,
            );
            const matchingReadings = matchingAccount
              ? await agentQuotaService.getLatestReadings(matchingAccount.id).catch(() => [])
              : [];
            const isCachedEcho =
              !!matchingAccount && liveCapturedAt <= newestCapturedAt(matchingReadings);

            account = matchingAccount;
            readings = matchingReadings;
            if (!isCachedEcho) {
              const persisted = await agentQuotaService
                .ingestClaudeSnapshot({
                  deviceId,
                  identity: live.identity,
                  readings: live.readings,
                })
                .then(() => true)
                .catch(() => false);
              if (persisted) {
                claude = (
                  (await agentQuotaService.listAccounts().catch(() => null)) ??
                  (accountRows ?? [])
                ).filter((a) => isObservableQuotaAccount(a, 'claude-code'));
                account = claude.find((a) => a.externalAccountId === liveExternalAccountId);
                readings = account
                  ? await agentQuotaService.getLatestReadings(account.id).catch(() => readings)
                  : readings;
              }
              // The confirmed sample still renders even when its history write
              // failed or its account row is invisible here — flagged, so the
              // panel does not pretend it came from persisted history.
              persistenceFailed = !persisted || !account;
            }
          } else {
            account = matchingAccount;
            readings = matchingAccount
              ? await agentQuotaService.getLatestReadings(matchingAccount.id).catch(() => [])
              : [];
          }
        }
      }

      // 3) The merged view exists only for the confirmed identity; it never
      // falls back to an arbitrary first row. With no resolved account the
      // live sample stands on its own — an unidentified one renders as
      // 'unknown' and gets no borrowed window.
      const merged = account ? buildClaudePanelSnapshot(account, readings, live) : null;
      if (merged && hasRenderableWindow(merged)) {
        return persistenceFailed ? { ...merged, persistenceFailed: true } : merged;
      }
      if (live && persistenceFailed) return { ...live, persistenceFailed: true };
      return live ?? merged ?? unavailableSnapshot();
    },
    [deviceId, env, sourceKey],
  );

  const getWindows = useCallback(
    (quota: ClaudeCodeQuotaSnapshot): QuotaWindowItem[] => [
      {
        compactGroup: 'global',
        compactLabel: t('heteroAgent.quota.session'),
        key: 'session',
        label: t('heteroAgent.quota.session'),
        window: quota.session,
      },
      {
        compactGroup: 'global',
        compactLabel: t('heteroAgent.quota.weekly'),
        key: 'weekly',
        label: t('heteroAgent.quota.weekly'),
        window: quota.weekly,
      },
      ...(quota.scopedWeekly
        ? [
            {
              compactGroup: 'scopedWeekly',
              compactLabel: quota.scopedWeekly.modelName,
              key: 'scopedWeekly',
              label: t('heteroAgent.claudeQuota.scopedWeekly', {
                model: quota.scopedWeekly.modelName,
              }),
              window: quota.scopedWeekly.window,
            },
          ]
        : []),
    ],
    [t],
  );

  const getUnavailableText = useCallback(
    (quota: ClaudeCodeQuotaSnapshot) => {
      switch (quota.reason) {
        case 'credentials-expired': {
          return t('heteroAgent.claudeQuota.unavailableExpired');
        }
        case 'credentials-not-found': {
          return t('heteroAgent.claudeQuota.unavailableNotFound');
        }
        case 'external-auth': {
          return t('heteroAgent.claudeQuota.unavailableExternalAuth');
        }
        default: {
          return undefined;
        }
      }
    },
    [t],
  );

  const getErrorText = useCallback(
    (quota: ClaudeCodeQuotaSnapshot) => {
      if (isRateLimitError(quota)) return t('heteroAgent.claudeQuota.errorRateLimited');
      // Never surface the raw fetch error (e.g. "fetch failed") — this branch only
      // shows when there is no persisted data to fall back to.
      return t('heteroAgent.claudeQuota.errorGeneric');
    },
    [t],
  );

  const getRefreshErrorText = useCallback(
    (quota: ClaudeCodeQuotaSnapshot) => {
      if (isRateLimitError(quota)) return t('heteroAgent.claudeQuota.refreshRateLimited');
    },
    [t],
  );

  const getNoticeText = useCallback(
    (quota: ClaudeCodePanelSnapshot) =>
      quota.persistenceFailed ? t('heteroAgent.claudeQuota.persistFailed') : undefined,
    [t],
  );

  return (
    <QuotaMenu
      autoRefreshMs={QUOTA_REFRESH_MS}
      createErrorSnapshot={createErrorSnapshot}
      fetchQuota={fetchQuota}
      getErrorText={getErrorText}
      getNoticeText={getNoticeText}
      getRefreshErrorText={getRefreshErrorText}
      getUnavailableText={getUnavailableText}
      getWindows={getWindows}
      renderHeader={(quota) => <QuotaAccountIdentity placement="top" snapshot={quota} />}
      sourceKey={sourceKey}
      title={t('heteroAgent.claudeQuota.title')}
      tooltip={t('heteroAgent.claudeQuota.tooltip')}
    />
  );
});

ClaudeCodeQuotaMenu.displayName = 'ClaudeCodeQuotaMenu';

export default ClaudeCodeQuotaMenu;
