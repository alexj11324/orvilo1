'use client';

import {
  BadgeCheck,
  CircleAlert,
  ListTodo,
  Loader2,
  MessageSquarePlus,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';

import { acceptanceContentLayout } from '../layout';

const styles = {
  // Keep decisions reachable above the scrolling checklist.
  bar: 'sticky bottom-4 z-20 mx-auto flex w-full flex-wrap items-center gap-3 rounded-(--ant-border-radius-lg) border border-sidebar-border bg-popover px-4 py-3 shadow-(--ant-box-shadow-tertiary) [@media(width<=767px)]:bottom-[max(8px,env(safe-area-inset-bottom))] [@media(width<=767px)]:p-3',
  summary: 'min-w-[160px] flex-1',
  actions:
    'flex-none flex-wrap justify-end [&>button]:flex-none [@media(width<=480px)]:w-full [@media(width<=480px)]:[&>button]:flex-1',
  completePop:
    'animate-[acceptance-decision-complete-pop_0.2s_ease-out_both] motion-reduce:animate-none',
};

type BarState = 'accepted' | 'live' | 'rejected' | 'settled';

/**
 * The review-progress dial: how many checks the user has signed off, of all.
 * At zero it reads as a dashed "not started" circle; the completed state is
 * rendered by the bar as the BadgeCheck disc, not here.
 */
const ProgressRing = memo<{ done: number; total: number }>(({ done, total }) => {
  const size = 20;
  const stroke = 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = total > 0 ? Math.min(done / total, 1) : 0;

  if (done <= 0)
    return (
      <svg height={size} style={{ flex: 'none' }} width={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          fill={'none'}
          r={radius}
          stroke={'var(--ant-color-text-quaternary)'}
          strokeDasharray={'3 5'}
          strokeLinecap={'round'}
          strokeWidth={stroke}
        />
      </svg>
    );

  return (
    <div style={{ flex: 'none', height: size, position: 'relative', width: size }}>
      <svg height={size} width={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          fill={'none'}
          r={radius}
          stroke={'var(--selected)'}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          fill={'none'}
          r={radius}
          stroke={'var(--primary)'}
          strokeDasharray={`${circumference * ratio} ${circumference}`}
          strokeLinecap={'round'}
          strokeWidth={stroke}
          style={{ transition: 'stroke-dasharray 0.3s ease' }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        className="flex flex-col items-center justify-center"
        style={{ fontSize: 10, fontVariantNumeric: 'tabular-nums', inset: 0, position: 'absolute' }}
      >
        <span style={{ color: 'var(--muted-foreground)', fontWeight: 600 }}>{done}</span>
      </div>
    </div>
  );
});

ProgressRing.displayName = 'AcceptanceProgressRing';

interface DecisionBarProps {
  /** Checks the user has signed off, of `totalCount` reviewable ones. */
  acceptedCount: number;
  /** Rendered inside the conversation portal — the composer beside the bar
      receives the repair draft, so the copy handoff stays standalone-only. */
  embedded?: boolean;
  /** Active (not-yet-consumed) feedback recorded this round. */
  feedbackCount: number;
  /** Checks removed from the acceptance scope by the reviewer. */
  ignoredCount: number;
  /** Checks the user reviewed as needing a fix (待修复) — decided, not pending. */
  needsFixCount: number;
  onAccept: () => void;
  /** Record a global (uncategorized) comment for the next round. */
  onAddComment: () => void;
  /** Copy the hardcoded repair prompt for pasting to any agent. */
  onCopyReview: () => void;
  onOpenFeedback: () => void;
  /** Open the aggregate reject dialog (comment required). */
  onRejectComment: () => void;
  /** Start the repair round: embedded, drafts the prompt into the composer
      beside the bar. Standalone pages only copy the repair prompt. */
  onRerun: () => void;
  pending: boolean;
  /** A live round that is a dispatched repair — coloured as an in-progress task
      (warning), not a neutral verify, to match the system's task-process cue. */
  repairing?: boolean;
  /** The origin conversation is known — the rerun dispatch has a target. */
  rerunAvailable: boolean;
  rerunPending: boolean;
  state: BarState;
  /** The state line, prepared by the page (status + counts wording). */
  statusText: string;
  subText?: string;
  totalCount: number;
}

/**
 * The floating decision strip (P-12): review progress, the feedback
 * clearing-list opener, and the closing actions. What the actions are follows
 * the review state — feedback queued for the next round turns the bar into a
 * repair handoff (打回重跑: embedded drafts the prompt into the composer
 * beside the bar; standalone copies the repair prompt);
 * a clean review offers reject-with-comment and accept, with accept gaining
 * primary weight only once every check is signed off.
 */
const DecisionBar = memo<DecisionBarProps>(
  ({
    acceptedCount,
    embedded,
    feedbackCount,
    ignoredCount,
    needsFixCount,
    onAccept,
    onAddComment,
    onCopyReview,
    onOpenFeedback,
    onRejectComment,
    onRerun,
    pending,
    repairing,
    rerunAvailable,
    rerunPending,
    state,
    statusText,
    subText,
    totalCount,
  }) => {
    const { t } = useTranslation('verify');

    const stateMeta = {
      accepted: { color: 'var(--success)', icon: BadgeCheck },
      // A repair round is an in-progress TASK — warn-coloured refresh, matching
      // the task-process cue; a plain verify stays neutral info.
      live: repairing
        ? { color: 'var(--warning)', icon: RefreshCw }
        : { color: 'var(--info)', icon: Loader2 },
      rejected: { color: 'var(--destructive)', icon: RotateCcw },
      settled: null,
    }[state];

    const allConfirmed = totalCount > 0 && acceptedCount + ignoredCount >= totalCount;
    const hasFeedback = feedbackCount > 0;
    // The dial tracks DECIDED checks (accepted + 待修复), so a fully-reviewed
    // union reads as done even when some checks still need a fix.
    const decidedCount = acceptedCount + needsFixCount + ignoredCount;
    // Every check reviewed, but some need a fix — a review outcome, not a
    // success and not "still awaiting". Reads as an attention mark, never the
    // near-complete progress dial that made the state look like an all-clear.
    const settledNeedsFix =
      state === 'settled' && !allConfirmed && decidedCount >= totalCount && needsFixCount > 0;

    // Pop the completion mark only on the real IN-SESSION transition into a
    // finished review — never on mount-when-already-done (revisiting a settled
    // acceptance) and never on an unrelated re-render. Seed the ref to `null`
    // so the first render (whatever its state) is treated as the baseline, not
    // a transition: `prev === false && now` is the one edge that fires.
    const reviewComplete = allConfirmed || settledNeedsFix;
    const prevComplete = useRef<boolean | null>(null);
    const justCompleted = prevComplete.current === false && reviewComplete;
    useEffect(() => {
      prevComplete.current = reviewComplete;
    }, [reviewComplete]);

    return (
      <div
        className={styles.bar}
        style={{
          maxWidth: acceptanceContentLayout.maxWidth - 2 * acceptanceContentLayout.paddingInline,
        }}
      >
        <div className={`flex items-center gap-2 ${styles.summary}`}>
          {stateMeta ? (
            // accepted / live / rejected — a plain coloured status mark.
            <stateMeta.icon
              className="animate-spin"
              color={stateMeta.color}
              size={22}
              style={{ flex: 'none' }}
            />
          ) : allConfirmed ? (
            // Every check signed off — the same clean badge the accepted state carries.
            <BadgeCheck
              className={justCompleted ? styles.completePop : undefined}
              color={'var(--success)'}
              size={22}
              style={{ flex: 'none' }}
            />
          ) : settledNeedsFix ? (
            <CircleAlert
              className={justCompleted ? styles.completePop : undefined}
              color={'var(--warning)'}
              size={22}
              style={{ flex: 'none' }}
            />
          ) : (
            <ProgressRing done={decidedCount} total={totalCount} />
          )}
          <div className="flex flex-col gap-0.5" style={{ flex: '0 1 auto', minWidth: 0 }}>
            <div className="truncate min-w-0 text-muted-foreground">{statusText}</div>
            {subText && (
              <div className="truncate min-w-0 text-[12px] text-muted-foreground">{subText}</div>
            )}
          </div>

          {/* The clearing list — every note this round queues for the next one.
            Sits with the status reading on the left: it explains that reading,
            while the right side stays pure actions. */}
          {feedbackCount > 0 && (
            <Button size="sm" style={{ flex: 'none' }} variant="ghost" onClick={onOpenFeedback}>
              <ListTodo />
              {t('acceptance.bar.feedback', { count: feedbackCount })}
            </Button>
          )}
        </div>
        <div className={`flex gap-2 ${styles.actions}`}>
          {/* A dispatched send-back (repairing) keeps the copy entry alive —
            the reviewer may still hand the prompt to another agent. Embedded,
            the composer beside it already receives the draft. */}
          {state === 'live' && hasFeedback && !embedded && (
            <Button disabled={pending} variant="secondary" onClick={onCopyReview}>
              {t('acceptance.bar.copyReview')}
            </Button>
          )}

          {(state === 'settled' || state === 'rejected') &&
            (hasFeedback || state === 'rejected' ? (
              // Feedback is queued — the delivery isn't being accepted now; the
              // bar's job is getting the repair round started.
              <>
                {/* Last words before the repair leaves — a global note the next
                  round reads, for what the queued per-check feedback missed. */}
                <Button disabled={pending} variant="secondary" onClick={onAddComment}>
                  <MessageSquarePlus />
                  {t('acceptance.bar.addComment')}
                </Button>
                {!embedded && (
                  <Button disabled={pending} variant="outline" onClick={onCopyReview}>
                    {t('acceptance.bar.copyReview')}
                  </Button>
                )}
                {embedded && rerunAvailable && (
                  <Button
                    disabled={pending}
                    loading={rerunPending}
                    variant="outline"
                    onClick={onRerun}
                  >
                    {t('acceptance.bar.rerun')}
                  </Button>
                )}
              </>
            ) : (
              // Clean review — accept carries primary weight only once every
              // check is signed off; before that it stays a quiet option.
              <>
                <Button disabled={pending} variant="ghost" onClick={onRejectComment}>
                  {t('acceptance.bar.rejectComment')}
                </Button>
                <Button
                  disabled={pending}
                  variant={allConfirmed ? 'default' : 'secondary'}
                  onClick={onAccept}
                >
                  {t('acceptance.actions.accept')}
                </Button>
              </>
            ))}
        </div>
      </div>
    );
  },
);

DecisionBar.displayName = 'AcceptanceDecisionBar';

export default DecisionBar;
