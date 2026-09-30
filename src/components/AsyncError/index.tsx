'use client';

import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { RotateCwIcon, TriangleAlertIcon } from 'lucide-react';
import { createElement, memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { normalizeAsyncError } from '@/libs/swr/normalizeError';

/**
 * The error counterpart to the loading family (`NeuralNetworkLoading`,
 * `SkeletonLoading`, …). One reusable component, several `variant`s so different
 * surfaces express failure differently without each re-implementing the
 * icon + reason + retry plumbing. Pick the variant by where the failure lives;
 * the judgment (status → copy, retryable → show/hide Retry) stays here.
 *
 * - `page`   — full detail page / whole surface: centered hero + Reload.
 * - `block`  — a card / settings tab / widget: bordered block + Reload.
 * - `inline` — a list row / small slot: single line + retry link.
 * - `metric` — a stat / aggregate slot: a **failed** marker where a number
 *              would sit, so an errored fetch never reads as a confident `$0`.
 */
export type AsyncErrorVariant = 'page' | 'block' | 'inline' | 'metric';

export interface AsyncErrorProps {
  /**
   * Custom action rendered in the retry button's slot — for terminal errors
   * where retrying can never succeed but the user still needs a way out
   * (e.g. a Back button on a 403).
   */
  action?: ReactNode;
  /** Override the auto-derived description (status-based copy otherwise). */
  description?: ReactNode;
  /** The thrown error; normalized for status-specific copy + retryable gating. */
  error?: unknown;
  /** Retry the same request (SWR `mutate` / query refetch). Hidden if absent. */
  onRetry?: () => void;
  /** Whether an explicit Retry action is currently in flight. */
  retrying?: boolean;
  /** Override the default title copy. */
  title?: ReactNode;
  variant?: AsyncErrorVariant;
}

const styles = createStaticStyles(({ css }) => ({
  block: css`
    width: 100%;
    min-height: 180px;
    padding: 32px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};

    background: ${cssVar.colorBgContainer};
  `,
  icon: css`
    color: ${cssVar.colorTextTertiary};
  `,
  inline: css`
    padding-block: 8px;
  `,
  metric: css`
    color: ${cssVar.colorTextQuaternary};
  `,
  page: css`
    flex: 1;
    width: 100%;
    min-height: 320px;
    padding: 48px;
  `,
}));

const AsyncError = memo<AsyncErrorProps>(
  ({ variant = 'block', error, onRetry, retrying = false, title, description, action }) => {
    const { t } = useTranslation('error');
    const { status, retryable } = normalizeAsyncError(error);

    // Status-specific copy when we recovered a status, else the generic reason.
    const reason =
      description ??
      (status ? t(`response.${status}` as any, t('asyncState.desc')) : t('asyncState.desc'));
    const heading = title ?? t('asyncState.title');
    const showRetry = !!onRetry && retryable;

    // ─── metric: a failed marker where a number would render (never a fake $0) ───
    if (variant === 'metric') {
      return (
        <div className={cn('flex items-center', styles.metric)} style={{ gap: 6 }}>
          {createElement(TriangleAlertIcon, { size: 14 })}
          <div className="text-[13px]" style={{ color: cssVar.colorTextQuaternary }}>
            {t('asyncState.metricLabel')}
          </div>
          {showRetry && (
            <Button
              disabled={retrying}
              loading={retrying}
              size={'small'}
              type={'text'}
              onClick={onRetry}
            >
              {t('error.retry')}
            </Button>
          )}
        </div>
      );
    }

    // ─── inline: single-line row failure with a retry link ───
    if (variant === 'inline') {
      return (
        <div className={cn('inline-flex gap-2 items-center justify-center', styles.inline)}>
          {createElement(TriangleAlertIcon, { size: 14 })}
          <div className="text-[13px]" style={{ color: cssVar.colorTextSecondary }}>
            {heading}
          </div>
          {showRetry && (
            <Button
              disabled={retrying}
              loading={retrying}
              size={'small'}
              type={'text'}
              onClick={onRetry}
            >
              {t('error.retry')}
            </Button>
          )}
        </div>
      );
    }

    // ─── page / block: centered hero, sized by variant ───
    return (
      <div
        className={cn(
          'flex items-center justify-center gap-3',
          variant === 'page' ? styles.page : styles.block,
        )}
      >
        {createElement(TriangleAlertIcon, { size: 16 })}
        <div className={'flex flex-col gap-1 items-center'}>
          <div className="font-semibold" style={{ fontSize: variant === 'page' ? 16 : 15 }}>
            {heading}
          </div>
          <div
            className="text-center text-[13px]"
            style={{ color: cssVar.colorTextTertiary, maxWidth: 360 }}
          >
            {reason}
          </div>
        </div>
        {action ??
          (showRetry && (
            <Button
              disabled={retrying}
              icon={createElement(RotateCwIcon, { size: 16 })}
              loading={retrying}
              size={'small'}
              onClick={onRetry}
            >
              {t('error.retry')}
            </Button>
          ))}
      </div>
    );
  },
);

AsyncError.displayName = 'AsyncError';

export default AsyncError;
