'use client';

import type { AcceptanceGroupFeedback } from '@orvilo/types';
import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { cn } from 'cn';
import {
  BadgeCheck,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CircleDashed,
  MessageSquareText,
  PartyPopper,
} from 'lucide-react';
import { Fragment, memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { useIsHydrated } from '@/hooks/useIsHydrated';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { AttachmentThumbs } from '../Evidence/attachments';
import { hasVisualEvidence } from '../Evidence/evidence';
import { openGroupFeedbackModal } from '../Review/modals';
import { AcceptanceCheckRow } from './CheckRow';
import type { CheckFilter } from './checkState';
import {
  checkFilterState,
  groupChecks,
  isException,
  isGroupFullyAccepted,
  SEVERITY,
  shouldGroupChecks,
  userReviewState,
} from './checkState';
import { styles } from './styles';
import type { AcceptanceCheck, CheckReviewInput, ProposalDismissInput } from './types';

interface CheckListProps {
  /** Whether the viewer may review checks (the aggregate's owner). */
  canReview: boolean;
  checks: AcceptanceCheck[];
  collapsedGroups: Set<string>;
  /** The latest round index — arbitrates group-feedback staleness. */
  currentRound: number;
  expanded: Set<string>;
  filter: CheckFilter;
  /** Group-scoped feedback entries recorded on the aggregate. */
  groupFeedback: AcceptanceGroupFeedback[];
  /** Answer a model proposal without ruling on the check itself. */
  onDismissProposal?: (input: ProposalDismissInput) => Promise<void>;
  /** Record group-scoped feedback; resolves true when the write landed. */
  onGroupFeedback: (category: string, comment: string, fileIds: string[]) => Promise<boolean>;
  /** Open an agent judge's verification run (its trace IS the argument). */
  onOpenTrace?: (verifierOperationId: string) => void | Promise<void>;
  /** Record the user's verdict; resolves true when the write landed. */
  onReview: (input: CheckReviewInput) => Promise<boolean>;
  onRound?: (round: number) => void;
  onToggleGroup: (key: string) => void;
  onToggleGroupItems: (ids: string[], open: boolean) => void;
  onToggleItem: (id: string) => void;
  reviewPending: boolean;
}

/** The union check list: one joined card, collapsible business groups. */
const CheckList = memo<CheckListProps>(
  ({
    canReview,
    checks,
    collapsedGroups,
    currentRound,
    expanded,
    filter,
    groupFeedback,
    onDismissProposal,
    onGroupFeedback,
    onReview,
    onOpenTrace,
    onRound,
    onToggleGroup,
    onToggleGroupItems,
    onToggleItem,
    reviewPending,
  }) => {
    const { t } = useTranslation('verify');
    const hydrated = useIsHydrated();
    const [acceptingGroup, setAcceptingGroup] = useState<string | null>(null);

    const visible = (check: AcceptanceCheck) =>
      filter === 'all' || checkFilterState(check) === filter;

    const visibleRows = checks
      .filter(visible)
      .sort(
        (a, b) =>
          SEVERITY[a.state] - SEVERITY[b.state] ||
          (hasVisualEvidence(b) ? 1 : 0) - (hasVisualEvidence(a) ? 1 : 0) ||
          a.introducedAtRound - b.introducedAtRound,
      );
    const groups = groupChecks(checks, t('acceptance.group.uncategorized'))
      .map((group) => ({
        ...group,
        rows: group.checks
          .filter(visible)
          .sort(
            (a, b) =>
              SEVERITY[a.state] - SEVERITY[b.state] ||
              (hasVisualEvidence(b) ? 1 : 0) - (hasVisualEvidence(a) ? 1 : 0) ||
              a.introducedAtRound - b.introducedAtRound,
          ),
      }))
      .filter((group) => group.rows.length > 0);

    // A filter that matches nothing must read as "this bucket is empty", not as
    // a blank bordered card — each filter gets its own reassuring line. But an
    // EMPTY pending bucket where every check is signed off isn't "nothing here"
    // — it's the finish line, so it earns a celebration instead of a flat line.
    if (visibleRows.length === 0) {
      const allAccepted = filter === 'pending' && isGroupFullyAccepted(checks);
      return (
        <div className={`flex flex-col items-center gap-3 justify-center ${styles.emptyCard}`}>
          {allAccepted ? (
            <>
              <PartyPopper className={styles.celebrateIcon} color={'var(--success)'} size={40} />
              <div className="flex flex-col items-center gap-1">
                <div className="font-semibold" style={{ color: 'var(--success)', fontSize: 15 }}>
                  {t('acceptance.checks.allAccepted.title')}
                </div>
                <div className="text-[13px] text-muted-foreground">
                  {t('acceptance.checks.allAccepted.desc')}
                </div>
              </div>
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant={'icon'}>
                  <CircleDashed />
                </EmptyMedia>
                <EmptyDescription>
                  {t(
                    filter === 'all'
                      ? 'acceptance.checks.empty'
                      : `acceptance.checks.emptyFilter.${filter}`,
                  )}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </div>
      );
    }

    if (!shouldGroupChecks(checks.length)) {
      return (
        <div className={`flex flex-col ${styles.groupCard}`}>
          {visibleRows.map((check) => (
            <AcceptanceCheckRow
              canReview={canReview}
              check={check}
              expanded={expanded.has(check.id)}
              key={check.id}
              reviewPending={reviewPending}
              onDismissProposal={onDismissProposal}
              onOpenTrace={onOpenTrace}
              onReview={onReview}
              onRound={onRound}
              onToggle={() => onToggleItem(check.id)}
            />
          ))}
        </div>
      );
    }

    return (
      <div className={`flex flex-col ${styles.groupCard}`}>
        {groups.map(({ checks: groupChecks_, key, label, rows }, groupIndex) => {
          const passed = groupChecks_.filter((check) => check.state === 'passed').length;
          const collapsed = collapsedGroups.has(key);
          const anyItemOpen = rows.some((check) => expanded.has(check.id));
          // Only executed checks can be stamped — see the row-level gating.
          const reviewableChecks = groupChecks_.filter((check) => check.result);
          const unaccepted = reviewableChecks.filter(
            (check) => !['accepted', 'ignored'].includes(userReviewState(check)),
          );
          // The header counts what the REVIEWER cares about: how many they
          // signed off, how many the verifier flagged, how many they sent
          // back — not the verifier's pass tally alone.
          const acceptedCount = reviewableChecks.filter(
            (check) => userReviewState(check) === 'accepted',
          ).length;
          const rejectedCount = reviewableChecks.filter(
            (check) => userReviewState(check) === 'rejected',
          ).length;
          const ignoredCount = reviewableChecks.filter(
            (check) => userReviewState(check) === 'ignored',
          ).length;
          const exceptionCount = groupChecks_.filter((check) => isException(check)).length;
          // Everything passed AND the user signed all of it off — the ratio
          // itself turns into the green receipt, no separate right-side note.
          const allVerified = passed === groupChecks_.length && isGroupFullyAccepted(groupChecks_);
          // Group-scoped feedback targets the raw category ('' = uncategorized).
          const rawCategory = key === 'uncategorized' ? '' : label;
          const feedbackEntries = groupFeedback.filter((entry) => entry.category === rawCategory);

          return (
            <Fragment key={key}>
              <div
                {...clickableProps()}
                className={cn(
                  `flex items-center gap-2 ${styles.groupHeader}`,
                  CLICKABLE_FOCUS_RING,
                )}
                style={{
                  borderBlockStart: groupIndex > 0 ? `1px solid var(--sidebar-border)` : 'none',
                }}
                onClick={() => onToggleGroup(key)}
              >
                <div className="font-semibold" style={{ fontSize: 13 }}>
                  {label}
                </div>
                {allVerified ? (
                  <div
                    className="flex items-center gap-1"
                    style={{ color: 'var(--success)', fontSize: 12 }}
                  >
                    <BadgeCheck size={13} />
                    {t('acceptance.group.allVerified', { passed, total: groupChecks_.length })}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="text-[12px] text-muted-foreground">
                      {t('acceptance.group.acceptedRatio', {
                        accepted: acceptedCount,
                        total: groupChecks_.length,
                      })}
                    </div>
                    {exceptionCount > 0 && (
                      <div style={{ color: 'var(--destructive)', fontSize: 12 }}>
                        {t('acceptance.group.failedCount', { count: exceptionCount })}
                      </div>
                    )}
                    {rejectedCount > 0 && (
                      <div style={{ color: 'var(--destructive)', fontSize: 12 }}>
                        {t('acceptance.group.rejectedCount', { count: rejectedCount })}
                      </div>
                    )}
                    {ignoredCount > 0 && (
                      <div className="text-[12px] text-muted-foreground">
                        {t('acceptance.group.ignoredCount', { count: ignoredCount })}
                      </div>
                    )}
                  </div>
                )}
                {/* Bulk accept sits by the ratio it settles, hover-revealed —
                    a full-width column of always-on buttons begs misclicks. */}
                {canReview &&
                  reviewableChecks.length > 0 &&
                  (unaccepted.length > 0 ? (
                    <Button
                      className={'acceptance-group-actions'}
                      disabled={reviewPending && acceptingGroup !== key}
                      loading={acceptingGroup === key}
                      size="sm"
                      // The spinner must stay visible after the pointer leaves.
                      style={acceptingGroup === key ? { opacity: 1 } : undefined}
                      variant="ghost"
                      onClick={async (event) => {
                        event.stopPropagation();
                        setAcceptingGroup(key);
                        const ok = await onReview({
                          action: 'accept',
                          checkItemIds: unaccepted.map((check) => check.id),
                        });
                        setAcceptingGroup(null);
                        // A fully signed-off group is settled business — fold it.
                        if (ok && !collapsed) onToggleGroup(key);
                      }}
                    >
                      <BadgeCheck data-icon="inline-start" />
                      {t('acceptance.review.acceptAll')}
                    </Button>
                  ) : allVerified || ignoredCount > 0 ? null : (
                    // Fully signed off but not all green — the mixed-verdict
                    // receipt that can't fold into the ratio text.
                    <div
                      className="flex items-center gap-1"
                      style={{ color: 'var(--success)', fontSize: 12 }}
                    >
                      <BadgeCheck size={13} />
                      {t('acceptance.review.acceptAllDone')}
                    </div>
                  ))}
                <div className="flex flex-col flex-1" />
                {/* Group-scoped feedback — the channel for concerns that
                    belong to no single check yet must reach the next round.
                    Lives with the other group-level controls by the chevron. */}
                {canReview && (
                  <span className={'acceptance-group-actions'}>
                    <ActionIcon
                      icon={MessageSquareText}
                      size={'small'}
                      title={t('acceptance.group.feedbackAction')}
                      onClick={(event) => {
                        event.stopPropagation();
                        openGroupFeedbackModal({
                          groupLabel: label,
                          onConfirm: (comment, fileIds) =>
                            onGroupFeedback(rawCategory, comment, fileIds),
                        });
                      }}
                    />
                  </span>
                )}
                {collapsed ? (
                  // Fixed-size placeholder keeps the header height stable across
                  // toggles — and stands in for the bulk expander on rows that
                  // navigate away instead of unfolding.
                  <div style={{ height: 24, width: 24 }} />
                ) : (
                  <ActionIcon
                    icon={anyItemOpen ? ChevronsDownUp : ChevronsUpDown}
                    size={'small'}
                    title={
                      anyItemOpen
                        ? t('acceptance.group.collapseItems')
                        : t('acceptance.group.expandItems')
                    }
                    onClick={(event) => {
                      event.stopPropagation();
                      // Expanding a group is "show me what still needs judgment"
                      // — rows the user already accepted are settled business
                      // and stay folded (they open individually on demand).
                      // Collapsing folds everything, accepted or not.
                      onToggleGroupItems(
                        anyItemOpen
                          ? rows.map((check) => check.id)
                          : rows
                              .filter((check) => userReviewState(check) !== 'accepted')
                              .map((check) => check.id),
                        !anyItemOpen,
                      );
                    }}
                  />
                )}
                <ChevronRight
                  color={'var(--ant-color-text-quaternary)'}
                  size={14}
                  style={{
                    transform: collapsed ? 'none' : 'rotate(90deg)',
                    transition: 'transform 0.2s',
                  }}
                />
              </div>
              {/* Group feedback trail — newest first; entries consumed by a
                  later round stay readable but visually recede. */}
              {!collapsed && feedbackEntries.length > 0 && (
                <div
                  className="flex flex-col gap-2.5"
                  style={{ paddingBlock: 10, paddingInline: 16 }}
                >
                  {[...feedbackEntries].reverse().map((entry) => {
                    const stale = entry.roundIndex < currentRound;
                    return (
                      <div
                        className="flex flex-col gap-1"
                        key={`${entry.createdAt}-${entry.roundIndex}`}
                        style={{ ...(stale ? { opacity: 0.55 } : undefined) }}
                      >
                        <div className="flex items-center gap-1.5">
                          <MessageSquareText
                            size={13}
                            color={
                              stale ? 'var(--ant-color-text-quaternary)' : 'var(--destructive)'
                            }
                          />
                          <div
                            style={{
                              color: stale
                                ? 'var(--ant-color-text-tertiary)'
                                : 'var(--destructive)',
                              fontSize: 12,
                            }}
                          >
                            {t('acceptance.group.feedbackLabel')}
                          </div>
                          <div className="text-[12px] text-muted-foreground">
                            {hydrated ? formatAbsoluteDateTime(entry.createdAt) : null}
                          </div>
                        </div>
                        <div style={{ fontSize: 12 }}>{entry.comment}</div>
                        <AttachmentThumbs attachments={entry.attachments} />
                      </div>
                    );
                  })}
                </div>
              )}
              {!collapsed &&
                rows.map((check) => (
                  <AcceptanceCheckRow
                    canReview={canReview}
                    check={check}
                    expanded={expanded.has(check.id)}
                    key={check.id}
                    reviewPending={reviewPending}
                    onDismissProposal={onDismissProposal}
                    onOpenTrace={onOpenTrace}
                    onReview={onReview}
                    onRound={onRound}
                    onToggle={() => onToggleItem(check.id)}
                  />
                ))}
            </Fragment>
          );
        })}
      </div>
    );
  },
);

CheckList.displayName = 'AcceptanceCheckList';

export default CheckList;
