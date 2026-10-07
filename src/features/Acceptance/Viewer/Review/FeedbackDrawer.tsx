'use client';

import type { AcceptanceAttachment } from '@orvilo/types';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import dayjs from 'dayjs';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { buttonHoverFeedback } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

import { AttachmentThumbs } from '../Evidence/attachments';

const styles = createStaticStyles(({ css }) => ({
  clickable: css`
    cursor: pointer;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  meta: css`
    flex: none;
    font-size: 11px;
    color: ${cssVar.colorTextQuaternary};
    white-space: nowrap;
  `,
  /* One feedback event as a list row — hairline-separated, no card chrome.
     The drawer is an audit trail; rows read as entries in a ledger. Roomy
     vertical rhythm: cramped rows made the trail read as one dense block. */
  row: css`
    padding-block: 20px;
    padding-inline: 8px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadius};

    &:last-child {
      border-block-end: none;
    }
  `,
  sectionTitle: css`
    font-size: 12px;
    font-weight: 500;
    color: ${cssVar.colorTextTertiary};
    letter-spacing: 0.04em;
  `,
  seq: css`
    flex: none;
    font-family: ${cssVar.fontFamilyCode};
    font-size: 11px;
    color: ${cssVar.colorTextSecondary};
  `,
}));

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
    `${t('acceptance.round', { round: entry.roundIndex })} · ${dayjs(entry.createdAt).format('MM-DD HH:mm')}`,
  ].filter(Boolean);

  return (
    <div
      role={entry.checkId ? 'button' : undefined}
      style={{ ...(entry.stale ? { opacity: 0.55 } : undefined) }}
      tabIndex={entry.checkId ? 0 : undefined}
      className={cx(
        `flex flex-col gap-2 ${cx(styles.row, entry.checkId && styles.clickable)}`,
        entry.checkId && buttonHoverFeedback,
      )}
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
