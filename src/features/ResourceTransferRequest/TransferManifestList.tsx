'use client';

import { Button, SkeletonText, Text } from '@lobehub/ui/base-ui';
import { cssVar } from 'antd-style';
import type { LucideIcon } from 'lucide-react';
import { PowerOff, RotateCcw, TriangleAlert, Unlink } from 'lucide-react';
import { createElement, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';

import type { TransferManifest } from '@/services/resourceTransferRequest';

import type { ManifestImpact, TransferManifestPerspective } from './transferManifestRows';
import { buildTransferManifestRows } from './transferManifestRows';

const IMPACT_ICON: Record<ManifestImpact, LucideIcon> = {
  blocker: TriangleAlert,
  carried: PowerOff,
  detached: Unlink,
  reset: RotateCcw,
};

interface RenderRow {
  icon: LucideIcon;
  id: string;
  text: string;
  /** Blocking or degraded status — coloured, and always sorted to the top. */
  warning?: boolean;
}

const ManifestRow = ({ icon, text, warning }: Omit<RenderRow, 'id'>) => (
  <div className="flex flex-row items-start gap-2">
    <span className="anticon" role="img" style={{ flex: 'none', marginBlockStart: 2 }}>
      {createElement(icon, {
        size: 14,
        width: 14,
        height: 14,
        color: warning ? cssVar.colorWarning : cssVar.colorTextTertiary,
        fill: 'transparent',
      })}
    </span>
    <Text fontSize={12} type={warning ? 'warning' : 'secondary'}>
      {text}
    </Text>
  </div>
);

export interface TransferManifestListProps {
  /** The manifest request failed — say so instead of rendering an empty summary. */
  error?: unknown;
  /** The manifest request is still in flight and there is no data to show yet. */
  loading?: boolean;
  manifest?: TransferManifest;
  /** Retry the failed manifest request in place. */
  onRetry?: () => void;
  /** Whose consequences the copy describes. */
  perspective: TransferManifestPerspective;
  retrying?: boolean;
  style?: CSSProperties;
  /**
   * `block` frames the rows in a titled panel — for a modal, where the manifest
   * is its own section. `inline` keeps them bare for a dense list card that
   * already provides the container.
   */
  variant?: 'block' | 'inline';
}

/**
 * What a member-to-member handover actually carries, rendered for either side:
 * what rides along disabled, what must be reconnected, what gets unbound. Both
 * parties see the same rows from their own perspective, so neither commits
 * blind — the whole reason this summary exists.
 */
const TransferManifestList = ({
  error,
  loading,
  manifest,
  onRetry,
  perspective,
  retrying,
  style,
  variant = 'inline',
}: TransferManifestListProps) => {
  const { t } = useTranslation('agent');
  const isInitiator = perspective === 'initiator';

  // A summary that failed to load, or has not arrived yet, must never look like
  // "nothing rides along" — that silence is exactly what this feature removes.
  if (error)
    return (
      <div className="flex flex-col gap-2" style={style}>
        <ManifestRow
          warning
          icon={TriangleAlert}
          text={t(
            isInitiator
              ? 'transferRequest.manifestInitiator.unavailable'
              : 'transferRequest.manifest.unavailable',
          )}
        />
        {onRetry && (
          <Button
            loading={retrying}
            size="small"
            style={{ alignSelf: 'flex-start', marginInlineStart: 22 }}
            onClick={onRetry}
          >
            {t('transferRequest.manifestRetry')}
          </Button>
        )}
      </div>
    );

  // A skeleton rather than nothing: the summary is the reason to pause before
  // accepting, so it must never land on a reader who has already moved on. The
  // label carries the same news to a screen reader, which a skeleton cannot.
  if (loading || !manifest)
    return loading ? (
      <div
        aria-label={t('transferRequest.manifestLoading')}
        className="flex flex-col"
        role="status"
        style={style}
      >
        <SkeletonText fontSize={12} gap={8} rows={2} width={['88%', '64%']} />
      </div>
    ) : null;

  const rows = buildTransferManifestRows(manifest, perspective);
  if (rows.length === 0) return null;

  const list = rows.map(({ id, impact, key, options }) => (
    <ManifestRow
      icon={IMPACT_ICON[impact]}
      key={id}
      text={t(key as never, options)}
      warning={impact === 'blocker'}
    />
  ));

  if (variant === 'inline')
    return (
      <div className="flex flex-col gap-2" style={style}>
        {list}
      </div>
    );

  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg bg-secondary" style={style}>
      <Text fontSize={12} type="secondary" weight={500}>
        {t('transferRequest.manifestTitle')}
      </Text>
      {list}
    </div>
  );
};

export default TransferManifestList;
