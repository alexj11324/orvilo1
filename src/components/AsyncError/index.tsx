'use client';

import { cn } from 'cn';
import { RotateCwIcon, TriangleAlertIcon } from 'lucide-react';
import { createElement, memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import Link from '@/components/Link';
import { Button } from '@/components/ui/button';
import { normalizeAsyncError } from '@/libs/swr/normalizeError';

import { recoverAuthentication } from './recoverAuthentication';

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

const styles = {
  block: 'min-h-45 w-full rounded-(--radius-card) border border-divider bg-card p-8',
  inline: 'py-2',
  metric: 'text-muted-foreground',
  page: 'min-h-80 w-full flex-1 p-12',
};

const AsyncError = memo<AsyncErrorProps>(
  ({ variant = 'block', error, onRetry, retrying = false, title, description, action }) => {
    const { t } = useTranslation('error');
    const { status, retryable } = normalizeAsyncError(error);

    // Status-specific copy when we recovered a status, else the generic reason.
    const reason =
      description ??
      (status === 401
        ? t('asyncState.signInDesc')
        : status === 403
          ? t('forbidden.desc')
          : status
            ? t(`response.${status}` as any, t('asyncState.desc'))
            : t('asyncState.desc'));
    const heading =
      title ??
      (status === 401
        ? t('asyncState.signInRequired')
        : status === 403
          ? t('forbidden.title')
          : t('asyncState.title'));
    const showRetry = !!onRetry && retryable;
    const recoveryAction =
      action ??
      (status === 401 ? (
        <Button size="lg" onClick={recoverAuthentication}>
          {t('asyncState.signIn')}
        </Button>
      ) : status === 403 ? (
        <Link href={'/'}>{t('forbidden.backHome')}</Link>
      ) : showRetry ? (
        <Button
          disabled={retrying}
          loading={retrying}
          size="lg"
          variant={variant === 'inline' || variant === 'metric' ? 'ghost' : 'default'}
          onClick={onRetry}
        >
          {(variant === 'block' || variant === 'page') && <RotateCwIcon size={16} />}
          {t('error.retry')}
        </Button>
      ) : null);

    // ─── metric: a failed marker where a number would render (never a fake $0) ───
    if (variant === 'metric') {
      return (
        <div className={cn('flex items-center gap-1.5', styles.metric)}>
          {createElement(TriangleAlertIcon, { size: 14 })}
          <div className="text-sm leading-5.5 text-muted-foreground">
            {t('asyncState.metricLabel')}
          </div>
          {recoveryAction}
        </div>
      );
    }

    // ─── inline: single-line row failure with a retry link ───
    if (variant === 'inline') {
      return (
        <div className={cn('inline-flex gap-2 items-center justify-center', styles.inline)}>
          {createElement(TriangleAlertIcon, { size: 14 })}
          <div className="text-sm leading-5.5 text-muted-foreground">{heading}</div>
          {recoveryAction}
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
          <div className="text-base font-semibold leading-6">{heading}</div>
          <div className="max-w-90 text-center text-sm leading-5.5 text-muted-foreground">
            {reason}
          </div>
        </div>
        {recoveryAction}
      </div>
    );
  },
);

AsyncError.displayName = 'AsyncError';

export default AsyncError;
