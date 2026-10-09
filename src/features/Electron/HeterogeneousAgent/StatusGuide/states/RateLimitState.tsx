import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { CalendarClock, Play, RotateCcw } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import GuideActions from '../GuideActions';
import GuideShell from '../GuideShell';
import type { HeterogeneousAgentGuideStateProps } from '../types';

const extractTimezoneLabel = (value?: string) => {
  if (!value) return;

  const match = value.match(/\(([^()]+)\)\s*$/);
  return match?.[1];
};

const RateLimitState = ({
  config,
  error,
  onDismiss,
  onOpenSystemTools,
  onRetry,
  schedule,
  variant,
}: HeterogeneousAgentGuideStateProps) => {
  const { t, i18n } = useTranslation('chat');
  const rawErrorDetails = error?.stderr || error?.message;
  const dateLocale = i18n.resolvedLanguage || i18n.language || undefined;
  // Prefer the persisted scheduled reset time so the "已安排" copy stays stable
  // even if the live error payload is missing it on reload.
  const effectiveResetsAt = schedule?.resetsAt ?? error?.rateLimitInfo?.resetsAt;
  const timezoneLabel = useMemo(
    () => extractTimezoneLabel(rawErrorDetails) || Intl.DateTimeFormat().resolvedOptions().timeZone,
    [rawErrorDetails],
  );
  const formattedResetAt = useMemo(() => {
    if (!effectiveResetsAt) return;

    try {
      return new Intl.DateTimeFormat(dateLocale, {
        hour: 'numeric',
        minute: '2-digit',
        ...(timezoneLabel ? { timeZone: timezoneLabel } : {}),
        weekday: 'short',
      }).format(new Date(effectiveResetsAt * 1000));
    } catch {
      // The reported timezone was rejected: fall back to a numeric local date-time.
      return formatAbsoluteDateTime(effectiveResetsAt * 1000) || undefined;
    }
  }, [dateLocale, effectiveResetsAt, timezoneLabel]);
  const rateLimitTypeLabel = useMemo(() => {
    const rateLimitType = error?.rateLimitInfo?.rateLimitType;
    if (!rateLimitType) return;

    if (rateLimitType === 'seven_day') {
      return t('cliRateLimitGuide.limitTypes.weekCycle');
    }

    if (rateLimitType === 'five_hour') {
      return t('cliRateLimitGuide.limitTypes.fiveHourCycle');
    }

    return rateLimitType.replaceAll('_', ' ');
  }, [error?.rateLimitInfo?.rateLimitType, t]);
  // The "~X h Y m" duration string, reused both for the header hint and the
  // scheduling action/label copy.
  const relativeDuration = useMemo(() => {
    if (!effectiveResetsAt) return;

    const diffMs = Math.max(0, effectiveResetsAt * 1000 - Date.now());
    const totalMinutes = Math.floor(diffMs / 60_000);
    if (totalMinutes <= 0) return;

    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    const parts: string[] = [];

    if (days > 0) parts.push(t('cliRateLimitGuide.relative.day', { count: days }));
    if (hours > 0) parts.push(t('cliRateLimitGuide.relative.hour', { count: hours }));
    if (minutes > 0 && parts.length < 2) {
      parts.push(t('cliRateLimitGuide.relative.minute', { count: minutes }));
    }

    return parts.length > 0 ? parts.slice(0, 2).join(' ') : undefined;
  }, [effectiveResetsAt, t]);
  const relativeResetText = useMemo(() => {
    if (!effectiveResetsAt) return;
    if (!relativeDuration) return t('cliRateLimitGuide.relative.soon');
    return t('cliRateLimitGuide.resetInApprox', { duration: relativeDuration });
  }, [effectiveResetsAt, relativeDuration, t]);

  const scheduleActions = useMemo(() => {
    if (!schedule) return;

    if (schedule.isScheduled) {
      return (
        <div className="flex gap-2 justify-end" style={{ flexWrap: 'wrap' }}>
          <Button size="sm" onClick={schedule.onCancel}>
            {t('cliRateLimitGuide.schedule.cancel')}
          </Button>
          <Button size="sm" variant="default" onClick={schedule.onRunNow}>
            <Play size={14} /> {t('cliRateLimitGuide.schedule.runNow')}
          </Button>
        </div>
      );
    }

    return (
      <div className="flex gap-2 justify-end" style={{ flexWrap: 'wrap' }}>
        {onRetry && (
          <Button size="sm" onClick={onRetry}>
            <RotateCcw size={14} /> {t('cliRateLimitGuide.schedule.retryNow')}
          </Button>
        )}
        <Button size="sm" variant="default" onClick={schedule.onSchedule}>
          <CalendarClock size={14} />{' '}
          {relativeDuration
            ? t('cliRateLimitGuide.schedule.continueAfter', { duration: relativeDuration })
            : t('cliRateLimitGuide.schedule.continueAfterReset')}
        </Button>
      </div>
    );
  }, [onRetry, relativeDuration, schedule, t]);

  const isScheduled = Boolean(schedule?.isScheduled);
  const title = isScheduled
    ? relativeDuration
      ? t('cliRateLimitGuide.schedule.titleForApprox', {
          duration: relativeDuration,
          name: config.title,
        })
      : t('cliRateLimitGuide.schedule.titleAfterReset', { name: config.title })
    : t('cliRateLimitGuide.title', { name: config.title });

  return (
    <GuideShell
      icon={<config.icon size={24} />}
      title={title}
      variant={variant}
      actions={
        scheduleActions ?? (
          <GuideActions
            retryLabel={t('cliRateLimitGuide.actions.retry')}
            openSystemToolsLabel={
              onRetry ? undefined : t('cliRateLimitGuide.actions.openSystemTools')
            }
            onOpenSystemTools={onRetry ? undefined : onOpenSystemTools}
            onRetry={onRetry}
          />
        )
      }
      headerDescription={
        !isScheduled && (
          <div className="text-muted-foreground">
            {t(
              rateLimitTypeLabel
                ? 'cliRateLimitGuide.afterResetWithLimitType'
                : 'cliRateLimitGuide.afterReset',
              {
                limitType: rateLimitTypeLabel,
                resetAt: formattedResetAt
                  ? `${formattedResetAt}${timezoneLabel ? ` (${timezoneLabel})` : ''}`
                  : t('cliRateLimitGuide.resetUnknown'),
              },
            )}
          </div>
        )
      }
      onDismiss={onDismiss}
    >
      <div className="flex flex-col gap-2">
        {formattedResetAt && (
          <div className="flex gap-2" style={{ alignItems: 'baseline' }}>
            <div className="font-semibold" style={{ fontSize: 12 }}>
              {t('cliRateLimitGuide.resetAt')}
            </div>
            <div
              className="flex gap-2"
              style={{ alignItems: 'baseline', flexWrap: 'nowrap', whiteSpace: 'nowrap' }}
            >
              <div>{`${formattedResetAt}${timezoneLabel ? ` (${timezoneLabel})` : ''}`}</div>
              {relativeResetText && (
                <div
                  className="text-muted-foreground"
                  style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                >
                  {relativeResetText}
                </div>
              )}
            </div>
          </div>
        )}

        {rateLimitTypeLabel && (
          <div className="flex items-center gap-2">
            <div className="font-semibold" style={{ fontSize: 12 }}>
              {t('cliRateLimitGuide.limitType')}
            </div>
            <div>{rateLimitTypeLabel}</div>
          </div>
        )}
      </div>
    </GuideShell>
  );
};

export default RateLimitState;
