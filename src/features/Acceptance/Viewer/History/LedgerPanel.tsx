'use client';

import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import {
  CheckCircle2,
  ChevronRight,
  Circle,
  CircleAlert,
  FileClock,
  Loader2,
  PanelRightClose,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { useIsHydrated } from '@/hooks/useIsHydrated';
import type { AcceptanceBundle } from '@/services/verify';

export type AcceptanceRound = AcceptanceBundle['rounds'][number];

/** Per-round acceptance tally (how many of the round's own checks the user signed off). */
export interface RoundReview {
  accepted: number;
  total: number;
}

const styles = createStaticStyles(({ css }) => ({
  countBadge: css`
    padding-block: 1px;
    padding-inline: 7px;
    border-radius: 99px;

    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillTertiary};
  `,
  round: css`
    padding-block: 10px;
    padding-inline: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};

    transition:
      box-shadow 0.2s ease,
      border-color 0.2s ease;
  `,
  roundActive: css`
    border-color: ${cssVar.colorPrimary};
    box-shadow: 0 0 0 2px ${cssVar.colorPrimaryBg};
  `,
  /* The whole card is the report affordance — no inner button. */
  roundClickable: css`
    cursor: pointer;

    .acceptance-round-open-hint {
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    &:hover {
      border-color: ${cssVar.colorBorder};
      background: ${cssVar.colorFillQuaternary};

      .acceptance-round-open-hint {
        opacity: 1;
      }
    }
  `,
}));

/** Only the still-running states keep a machine indicator; a settled round is
    reframed as an ACCEPTANCE state (已验收 / 待验收), not a verification verdict. */
const RUNNING_META: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
  errored: { color: cssVar.colorWarning, icon: CircleAlert },
  repairing: { color: cssVar.colorWarning, icon: RefreshCw },
  verifying: { color: cssVar.colorInfo, icon: Loader2 },
};

/** Is the round still executing (so it has no settled result to accept yet)? */
const isRunningRound = (round: AcceptanceRound): boolean => {
  const status = round.run.status;
  if (status === 'verifying' || status === 'repairing' || status === 'errored') return true;
  // No report yet and no terminal status → still spinning up.
  return !round.report && status !== 'passed' && status !== 'failed';
};

interface LedgerPanelProps {
  /** The hosting surface already provides a close affordance (narrow-mode
      Drawer) — a second collapse icon here would read as two closes. */
  hideCollapse?: boolean;
  highlight: number | null;
  onCollapse: () => void;
  onOpenReport: (round: AcceptanceRound) => void;
  /** Per-round acceptance tally, keyed by round index (the round's own checks). */
  reviewByRound: Map<number, RoundReview>;
  rounds: AcceptanceRound[];
}

/**
 * The execution history, demoted to an audit side panel (P-13). Each row is a
 * round; the state it reports is the user's ACCEPTANCE progress on that round's
 * checks (已验收 / 待验收), not the raw verification verdict — the panel speaks
 * the same acceptance language as the checklist.
 */
const LedgerPanel = memo<LedgerPanelProps>(
  ({ hideCollapse, highlight, onCollapse, onOpenReport, reviewByRound, rounds }) => {
    const { t } = useTranslation('verify');
    const hydrated = useIsHydrated();
    const latestIndex = rounds.at(-1)?.run.roundIndex;

    return (
      <div className="flex flex-col gap-3" style={{ padding: 16 }}>
        <div className="flex items-center gap-2">
          <FileClock color={cssVar.colorTextSecondary} size={16} />
          <div className="font-semibold" style={{ fontSize: 13 }}>
            {t('acceptance.ledger.title')}
          </div>
          <span className={styles.countBadge}>{rounds.length}</span>
          <div className="flex flex-col flex-1" />
          {!hideCollapse && (
            <ActionIcon
              icon={PanelRightClose}
              size={'small'}
              title={t('acceptance.ledger.collapse')}
              onClick={onCollapse}
            />
          )}
        </div>
        {[...rounds].reverse().map((round) => {
          const running = isRunningRound(round);
          const runStatus = round.run.status ?? 'verifying';
          const runningMeta = running ? (RUNNING_META[runStatus] ?? RUNNING_META.verifying) : null;
          const rv =
            round.run.roundIndex != null ? reviewByRound.get(round.run.roundIndex) : undefined;
          const total = rv?.total ?? 0;
          const accepted = rv?.accepted ?? 0;
          const allAccepted = total > 0 && accepted >= total;

          // A round the user sent back is a distinct outcome, not "still
          // pending" — without this it renders identically to an unreviewed
          // round, so the ledger cannot show which round triggered a rerun.
          const rejected = round.run.userDecision === 'reject';

          const stateColor = runningMeta
            ? runningMeta.color
            : rejected
              ? cssVar.colorError
              : allAccepted
                ? cssVar.colorSuccess
                : cssVar.colorTextTertiary;
          const stateIcon = runningMeta
            ? runningMeta.icon
            : rejected
              ? RotateCcw
              : allAccepted
                ? CheckCircle2
                : Circle;
          const stateLabel = runningMeta
            ? t(`acceptance.roundStatus.${runStatus}` as 'acceptance.roundStatus.verifying', {
                defaultValue: runStatus,
              })
            : rejected
              ? t('acceptance.status.rejected')
              : allAccepted
                ? t('acceptance.ledger.accepted')
                : t('acceptance.ledger.pending');

          // Acceptance-framed stats: how many of THIS round's checks are signed
          // off (accepted/total), or all still awaiting. A rejected round shows
          // the reason instead — it is the input that seeded the next round.
          const stats = rejected
            ? round.run.decisionDetail?.comment || t('acceptance.banner.rejectedHint')
            : running || total === 0
              ? null
              : accepted > 0
                ? t('acceptance.ledger.acceptedStats', { accepted, total })
                : t('acceptance.ledger.awaitingStats', { total });

          const openable = Boolean(round.report);

          return (
            <div
              aria-label={openable ? t('acceptance.ledger.viewReport') : undefined}
              key={round.run.id}
              role={openable ? 'button' : undefined}
              className={`flex flex-col gap-1.5 ${cx(
                styles.round,
                openable && styles.roundClickable,
                highlight === round.run.roundIndex && styles.roundActive,
              )}`}
              onClick={openable ? () => onOpenReport(round) : undefined}
            >
              <div className="flex items-center gap-2">
                <div className="font-semibold" style={{ fontSize: 13 }}>
                  {t('acceptance.round', { round: round.run.roundIndex })}
                </div>
                {round.run.roundIndex === latestIndex && (
                  <div className="text-[12px] text-muted-foreground">
                    {t('acceptance.ledger.latest')}
                  </div>
                )}
                <div
                  className="flex items-center gap-1"
                  style={{ color: stateColor, fontSize: 12 }}
                >
                  {createElement(stateIcon, { className: 'animate-spin', size: 13 })}
                  {stateLabel}
                </div>
                <div className="flex flex-col flex-1" />
                <div className="text-[12px] text-muted-foreground">
                  {hydrated ? formatAbsoluteDateTime(round.run.createdAt) : null}
                </div>
                {openable && (
                  <ChevronRight
                    className="'acceptance-round-open-hint'"
                    color={cssVar.colorTextTertiary}
                    size={14}
                  />
                )}
              </div>
              {round.run.title && (
                <div className="text-[12px] text-muted-foreground" style={{ lineHeight: 1.5 }}>
                  {round.run.title}
                </div>
              )}
              {stats && <div className="text-[12px] text-muted-foreground">{stats}</div>}
            </div>
          );
        })}
      </div>
    );
  },
);

LedgerPanel.displayName = 'AcceptanceLedgerPanel';

export default LedgerPanel;
