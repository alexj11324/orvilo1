'use client';

import type { AcceptanceAttachment } from '@orvilo/types';
import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import { AttachmentThumbs } from '../Evidence/attachments';

const styles = {
  clickable: 'cursor-pointer hover:bg-(--ant-color-fill-quaternary)',
  meta: 'flex-none text-[11px] text-(--ant-color-text-quaternary) whitespace-nowrap',
  /* The drawer is an audit trail: roomy ledger entries separated by hairlines. */
  row: 'rounded-(--ant-border-radius) border-b border-sidebar-border px-2 py-5 last:border-b-0',
  sectionTitle: 'text-[12px] font-medium text-(--ant-color-text-tertiary) tracking-[0.04em]',
  seq: 'flex-none font-mono text-[11px] text-muted-foreground',
};

/** One feedback event, flattened for the clearing list — check-scoped or group/global. */
export interface FeedbackListEntry {
  /** Number of circled regions carried by the feedback (check rejects). */
  annotationCount?: number;
  /** Resolved screenshots the reviewer attached to the feedback. */
  attachments?: AcceptanceAttachment[];
  /** Jump target — set for check-scoped entries. */
  checkId?: string;
  /** Check label ("C3") for check-scoped entries. */
  checkSeq?: number;
  comment: string;
  createdAt: string;
  /** Group label; '' = the whole-delivery (global) channel. */
  groupLabel?: string;
  kind: 'check' | 'group';
  roundIndex: number;
  /** Consumed by a later round — history, not the next round's input. */
  stale: boolean;
  /** Check title for check-scoped entries. */
  title?: string;
}

interface FeedbackDrawerProps {
  entries: FeedbackListEntry[];
  onClose: () => void;
  /** Expand + scroll to a check row in the union list. */
  onJumpToCheck: (checkId: string) => void;
  open: boolean;
}

const EntryRow = memo<{
  entry: FeedbackListEntry;
  onJumpToCheck: (checkId: string) => void;
}>(({ entry, onJumpToCheck }) => {
  const { t } = useTranslation('verify');
  const isCheck = entry.kind === 'check';
  const metaBits = [
    entry.annotationCount
      ? t('acceptance.feedback.annotations', { count: entry.annotationCount })
      : null,
    `${t('acceptance.round', { round: entry.roundIndex })} · ${formatAbsoluteDateTime(entry.createdAt)}`,
  ].filter(Boolean);

  return (
    <div
      className={`flex flex-col gap-2 ${cn(styles.row, entry.checkId && styles.clickable)}`}
      role={entry.checkId ? 'button' : undefined}
      style={{ ...(entry.stale ? { opacity: 0.55 } : undefined) }}
      tabIndex={entry.checkId ? 0 : undefined}
      onClick={entry.checkId ? () => onJumpToCheck(entry.checkId!) : undefined}
      onKeyDown={(event) => {
        if (
          event.target === event.currentTarget &&
          entry.checkId &&
          (event.key === 'Enter' || event.key === ' ')
        ) {
          event.preventDefault();
          onJumpToCheck(entry.checkId);
        }
      }}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        {isCheck ? (
          <>
            <span className={styles.seq}>C{entry.checkSeq}</span>
            <div className="truncate min-w-0" style={{ fontSize: 13, minWidth: 0 }}>
              {entry.title}
            </div>
          </>
        ) : (
          <div className="truncate min-w-0" style={{ fontSize: 13, minWidth: 0 }}>
            {entry.groupLabel
              ? t('acceptance.feedback.group', { label: entry.groupLabel })
              : t('acceptance.feedback.global')}
          </div>
        )}
        <div className="flex flex-col flex-1" />
        <span className={styles.meta}>{metaBits.join(' · ')}</span>
      </div>
      {entry.comment && (
        <div className="text-muted-foreground" style={{ fontSize: 12 }}>
          {entry.comment}
        </div>
      )}
      <AttachmentThumbs attachments={entry.attachments} />
    </div>
  );
});

/**
 * The feedback clearing house: what THIS round's review has queued for the
 * next verification round (active), and everything earlier rounds already
 * consumed (history) — one place to audit the whole trail. Entries render as
 * a flat hairline list, not cards — it is a ledger, not a gallery.
 */
const FeedbackDrawer = memo<FeedbackDrawerProps>(({ entries, onClose, onJumpToCheck, open }) => {
  const { t } = useTranslation('verify');
  const active = entries.filter((entry) => !entry.stale);
  const history = entries.filter((entry) => entry.stale);

  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" style={{ maxWidth: 'none', width: 'min(92vw, 440px)' }}>
        <SheetHeader>
          <SheetTitle>{t('acceptance.feedback.title')}</SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <div className={cn(styles.sectionTitle)}>
              {t('acceptance.feedback.current', { count: active.length })}
            </div>
            {active.length === 0 && (
              <div className="text-[12px] text-muted-foreground">
                {t('acceptance.feedback.empty')}
              </div>
            )}
            <div className="flex flex-col">
              {active.map((entry, index) => (
                <EntryRow entry={entry} key={index} onJumpToCheck={onJumpToCheck} />
              ))}
            </div>
          </div>
          {history.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className={cn(styles.sectionTitle)}>
                {t('acceptance.feedback.history', { count: history.length })}
              </div>
              <div className="flex flex-col">
                {history.map((entry, index) => (
                  <EntryRow entry={entry} key={index} onJumpToCheck={onJumpToCheck} />
                ))}
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
});

FeedbackDrawer.displayName = 'AcceptanceFeedbackDrawer';

export default FeedbackDrawer;
