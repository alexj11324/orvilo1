'use client';

import type {
  CodexQuotaSnapshot,
  CodexQuotaWindow,
  CodexRateLimitResetCredit,
} from '@orvilo/electron-client-ipc';
import { uuid } from '@orvilo/utils';
import { cssVar } from 'antd-style';
import { cn } from 'cn';
import { RotateCcwIcon } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { confirmModal } from '@/components/Modal';
import { toast } from '@/components/toast';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { heterogeneousAgentService } from '@/services/electron/heterogeneousAgent';

import type { FetchQuotaOptions, QuotaMenuHelpers, QuotaWindowItem } from './QuotaMenu';
import QuotaMenu, { createQuotaSourceKey } from './QuotaMenu';

const FIVE_HOUR_WINDOW_MINUTES = 5 * 60;
const WEEKLY_WINDOW_MINUTES = 7 * 24 * 60;
const MONTHLY_WINDOW_MIN_MINUTES = 28 * 24 * 60;
const MONTHLY_WINDOW_MAX_MINUTES = 31 * 24 * 60;

const isConnectionError = (quota: CodexQuotaSnapshot) =>
  /error sending request for url|fetch failed|\b(?:ECONNREFUSED|ENOTFOUND|ETIMEDOUT)\b/i.test(
    quota.error ?? '',
  );

const styles = {
  credit:
    'min-w-0 py-2 px-2.5 [&:not(:last-child)]:[border-block-end:1px_solid_var(--ant-color-border-secondary)]',
  creditCollapse: 'w-full',
  creditExpiry: 'flex-none text-end whitespace-nowrap',
  creditIndex: '[flex:0_0_20px] tabular-nums text-[var(--ant-color-text-tertiary)] text-center',
  creditList:
    'overflow-hidden border border-solid border-sidebar-border rounded-(--radius-card) bg-[var(--ant-color-fill-quaternary)] bg-none',
  creditTitle: 'overflow-hidden flex-1 min-w-0 text-ellipsis whitespace-nowrap',
  feedback:
    "p-2 border border-solid border-[var(--ant-color-info-border)] rounded-(--radius-card) text-[var(--ant-color-info-text)] bg-[var(--ant-color-info-bg)] bg-none [&[data-kind='error']]:border-[var(--ant-color-error-border)] [&[data-kind='error']]:text-[var(--ant-color-error-text)] [&[data-kind='error']]:bg-[var(--ant-color-error-bg)] [&[data-kind='error']]:bg-none [&[data-kind='success']]:border-[var(--ant-color-success-border)] [&[data-kind='success']]:text-[var(--ant-color-success-text)] [&[data-kind='success']]:bg-[var(--ant-color-success-bg)] [&[data-kind='success']]:bg-none",
  resetCredits: 'pbs-2 [border-block-start:1px_solid_var(--ant-color-border-secondary)]',
};

const createErrorSnapshot = (error: unknown): CodexQuotaSnapshot => ({
  error: error instanceof Error ? error.message : String(error),
  provider: 'codex',
  rateLimitResetCredits: null,
  session: null,
  status: 'error',
  updatedAt: Date.now(),
  weekly: null,
});

const getAvailableResetCredits = (credits: CodexRateLimitResetCredit[] | undefined, now: number) =>
  [...(credits ?? [])]
    .filter(
      (credit) =>
        credit.status === 'available' && (credit.expiresAt === null || credit.expiresAt > now),
    )
    .sort((left, right) => {
      const expiryDifference =
        (left.expiresAt ?? Number.POSITIVE_INFINITY) -
        (right.expiresAt ?? Number.POSITIVE_INFINITY);
      if (expiryDifference !== 0) return expiryDifference;
      return (left.id ?? '').localeCompare(right.id ?? '');
    });

interface CodexQuotaMenuProps {
  command?: string;
  env?: Record<string, string>;
}

interface ResetAttempt {
  creditId?: string;
  idempotencyKey: string;
}

interface ResetFeedback {
  kind: 'error' | 'info' | 'success';
  text: string;
}

const CodexQuotaMenu = memo<CodexQuotaMenuProps>(({ command, env }) => {
  const { t } = useTranslation('chat');
  const sourceKey = createQuotaSourceKey('codex', command, env);
  const activeSourceKeyRef = useRef(sourceKey);
  const resetAttemptRef = useRef<ResetAttempt | null>(null);
  const [resetFeedback, setResetFeedback] = useState<ResetFeedback>();
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    activeSourceKeyRef.current = sourceKey;
    resetAttemptRef.current = null;
    setResetFeedback(undefined);
    setResetting(false);
  }, [sourceKey]);

  const fetchQuota = useCallback(
    (options?: FetchQuotaOptions<CodexQuotaSnapshot>) =>
      heterogeneousAgentService.getCodexQuota({
        command,
        env,
        ...(options?.force ? { force: true } : {}),
      }),
    [command, env],
  );

  const getWindowLabel = useCallback(
    (window: CodexQuotaWindow | null, fallback: string) => {
      if (!window) return fallback;
      if (window.windowMinutes === FIVE_HOUR_WINDOW_MINUTES) {
        return t('heteroAgent.codexQuota.fiveHour');
      }
      if (window.windowMinutes === WEEKLY_WINDOW_MINUTES) {
        return t('heteroAgent.quota.weekly');
      }
      if (
        window.windowMinutes >= MONTHLY_WINDOW_MIN_MINUTES &&
        window.windowMinutes <= MONTHLY_WINDOW_MAX_MINUTES
      ) {
        return t('heteroAgent.codexQuota.monthly');
      }
      return fallback;
    },
    [t],
  );

  const getWindows = useCallback(
    (quota: CodexQuotaSnapshot): QuotaWindowItem[] => {
      const rateLimit = quota.rateLimits?.find(
        (rateLimit) => rateLimit.limitId.toLowerCase() === 'codex',
      );

      if (!rateLimit) {
        return [
          {
            key: 'primary',
            label: getWindowLabel(quota.session, t('heteroAgent.quota.session')),
            window: quota.session,
          },
          {
            key: 'secondary',
            label: getWindowLabel(quota.weekly, t('heteroAgent.quota.weekly')),
            window: quota.weekly,
          },
        ];
      }

      return [
        {
          key: `${rateLimit.limitId}:primary`,
          label: getWindowLabel(rateLimit.primary, t('heteroAgent.quota.session')),
          window: rateLimit.primary,
        },
        {
          key: `${rateLimit.limitId}:secondary`,
          label: getWindowLabel(rateLimit.secondary, t('heteroAgent.quota.weekly')),
          window: rateLimit.secondary,
        },
      ];
    },
    [getWindowLabel, t],
  );

  const hasExtraData = useCallback(
    (quota: CodexQuotaSnapshot) => !!quota.rateLimitResetCredits,
    [],
  );

  const getErrorText = useCallback(
    (quota: CodexQuotaSnapshot) =>
      isConnectionError(quota)
        ? t('heteroAgent.codexQuota.errorConnection')
        : t('heteroAgent.codexQuota.errorGeneric'),
    [t],
  );

  const consumeReset = useCallback(
    async (
      creditId: string | undefined,
      applyQuota: (quota: CodexQuotaSnapshot) => void,
      requestSourceKey: string,
    ) => {
      const previousAttempt = resetAttemptRef.current;
      const attempt =
        previousAttempt && previousAttempt.creditId === creditId
          ? previousAttempt
          : {
              ...(creditId ? { creditId } : {}),
              idempotencyKey: uuid(),
            };
      resetAttemptRef.current = attempt;
      setResetFeedback(undefined);
      setResetting(true);

      try {
        const result = await heterogeneousAgentService.consumeCodexRateLimitResetCredit({
          command,
          ...(attempt.creditId ? { creditId: attempt.creditId } : {}),
          env,
          idempotencyKey: attempt.idempotencyKey,
        });
        if (activeSourceKeyRef.current !== requestSourceKey) return;

        applyQuota(result.quota);
        resetAttemptRef.current = null;

        switch (result.outcome) {
          case 'alreadyRedeemed':
          case 'reset': {
            const text = t('heteroAgent.codexQuota.resetSuccess');
            setResetFeedback({ kind: 'success', text });
            toast.success(text);
            break;
          }
          case 'nothingToReset': {
            setResetFeedback({
              kind: 'info',
              text: t('heteroAgent.codexQuota.resetNothingToReset'),
            });
            break;
          }
          case 'noCredit': {
            setResetFeedback({
              kind: 'error',
              text: t('heteroAgent.codexQuota.resetNoCredit'),
            });
            break;
          }
        }
      } catch (error) {
        console.error('Failed to consume Codex rate-limit reset credit:', error);
        if (activeSourceKeyRef.current !== requestSourceKey) return;

        const text = t('heteroAgent.codexQuota.resetFailed');
        setResetFeedback({ kind: 'error', text });
        toast.error(text);
      } finally {
        if (activeSourceKeyRef.current === requestSourceKey) setResetting(false);
      }
    },
    [command, env, t],
  );

  const confirmReset = useCallback(
    (creditId: string | undefined, applyQuota: (quota: CodexQuotaSnapshot) => void) => {
      const requestSourceKey = sourceKey;
      confirmModal({
        cancelText: t('cancel', { ns: 'common' }),
        content: t('heteroAgent.codexQuota.resetConfirmDescription'),
        okText: t('heteroAgent.codexQuota.resetNow'),
        onOk: () => consumeReset(creditId, applyQuota, requestSourceKey),
        title: t('heteroAgent.codexQuota.resetConfirmTitle'),
      });
    },
    [consumeReset, sourceKey, t],
  );

  const renderFooter = useCallback(
    (
      quota: CodexQuotaSnapshot,
      { applyQuota, formatDuration, now }: QuotaMenuHelpers<CodexQuotaSnapshot>,
    ) => {
      const resetCredits = quota.rateLimitResetCredits;

      if (!resetCredits) {
        return (
          <div className={cn('flex flex-col gap-1', styles.resetCredits)}>
            <div className="flex flex-row items-center gap-1">
              <span className="anticon" role="img">
                <RotateCcwIcon fill={'transparent'} height={14} size={14} width={14} />
              </span>
              <div className="text-muted-foreground" style={{ fontSize: 12 }}>
                {t('heteroAgent.codexQuota.resetCreditsUnavailable')}
              </div>
            </div>
          </div>
        );
      }

      const resetCreditCount = resetCredits.availableCount;
      const availableCredits = getAvailableResetCredits(resetCredits.credits, now).slice(
        0,
        resetCreditCount,
      );
      const nextCredit = availableCredits[0];
      const resetCreditItems = Array.from({ length: resetCreditCount }, (_, index) => ({
        credit: availableCredits[index],
        index: index + 1,
      }));

      return (
        <div className={cn('flex flex-col', styles.resetCredits)}>
          <Accordion className={styles.creditCollapse} defaultValue={[]}>
            <AccordionItem
              disabled={!(resetCreditCount > 0 || !!resetFeedback)}
              value="reset-credits"
            >
              <AccordionTrigger>
                <div className="flex flex-col gap-0.5">
                  <div className="flex flex-row items-center gap-1">
                    <span className="anticon" role="img">
                      <RotateCcwIcon fill={'transparent'} height={14} size={14} width={14} />
                    </span>
                    <div className="font-semibold" style={{ fontSize: 12 }}>
                      {t('heteroAgent.codexQuota.resetCredits', { count: resetCreditCount })}
                    </div>
                  </div>
                  {resetCredits.totalEarnedCount !== undefined && (
                    <div style={{ fontSize: 12, color: cssVar.colorTextTertiary }}>
                      {t('heteroAgent.codexQuota.totalEarned', {
                        count: resetCredits.totalEarnedCount,
                      })}
                    </div>
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-col gap-2">
                  {resetCreditItems.length > 0 && (
                    <div className={cn('flex flex-col', styles.creditList)}>
                      {resetCreditItems.map(({ credit, index }) => {
                        const fallbackExpiry = index === 1 ? resetCredits.nextExpiresAt : undefined;
                        const expiresAt = credit ? credit.expiresAt : fallbackExpiry;
                        const expiresIn = expiresAt ? formatDuration(expiresAt - now) : undefined;

                        return (
                          <div
                            className={cn('flex flex-row items-center gap-2', styles.credit)}
                            key={credit?.id ?? `reset-credit-${index}`}
                          >
                            <div className={styles.creditIndex} style={{ fontSize: 12 }}>
                              {`#${index}`}
                            </div>
                            <div
                              className={cn('font-semibold', styles.creditTitle)}
                              style={{ fontSize: 12 }}
                            >
                              {credit?.title || t('heteroAgent.codexQuota.resetCreditTitle')}
                            </div>
                            <div
                              className={cn('text-muted-foreground', styles.creditExpiry)}
                              style={{ fontSize: 12 }}
                            >
                              {expiresAt
                                ? expiresIn
                                  ? t('heteroAgent.codexQuota.expiresIn', {
                                      duration: expiresIn,
                                    })
                                  : t('heteroAgent.codexQuota.expiresSoon')
                                : credit
                                  ? t('heteroAgent.codexQuota.doesNotExpire')
                                  : t('heteroAgent.codexQuota.resetCreditDetailsUnavailable')}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {resetFeedback && (
                    <div
                      aria-live="polite"
                      className={styles.feedback}
                      data-kind={resetFeedback.kind}
                      role={resetFeedback.kind === 'error' ? 'alert' : 'status'}
                    >
                      {resetFeedback.text}
                    </div>
                  )}

                  {resetCreditCount > 0 && (
                    <Button
                      className="w-full"
                      loading={resetting}
                      size={'sm'}
                      variant="default"
                      onClick={() => confirmReset(nextCredit?.id ?? undefined, applyQuota)}
                    >
                      <RotateCcwIcon data-icon="inline-start" />
                      {resetting
                        ? t('heteroAgent.codexQuota.resetting')
                        : t('heteroAgent.codexQuota.resetNow')}
                    </Button>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      );
    },
    [confirmReset, resetFeedback, resetting, t],
  );

  return (
    <QuotaMenu
      contentWidth={360}
      createErrorSnapshot={createErrorSnapshot}
      fetchQuota={fetchQuota}
      getErrorText={getErrorText}
      getRefreshErrorText={getErrorText}
      getWindows={getWindows}
      hasExtraData={hasExtraData}
      renderFooter={renderFooter}
      sourceKey={sourceKey}
      title={t('heteroAgent.codexQuota.title')}
      tooltip={t('heteroAgent.codexQuota.tooltip')}
    />
  );
});

CodexQuotaMenu.displayName = 'CodexQuotaMenu';

export default CodexQuotaMenu;
