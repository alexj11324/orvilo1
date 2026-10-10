'use client';

import { Image } from '@lobehub/ui';
import type { AcceptanceReviewAnnotation } from '@orvilo/types';
import { formatAbsoluteDateTime } from '@orvilo/utils/time';
import { cn } from 'cn';
import { BadgeCheck, Ban, MessageSquareX } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { SimpleTooltip } from '@/components/ui/tooltip';
import AudioPlayer from '@/features/AudioPlayer';
import { useIsHydrated } from '@/hooks/useIsHydrated';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { AnnotatedImage } from '../Evidence/Annotation';
import { AttachmentThumbs } from '../Evidence/attachments';
import { IMAGE_EVIDENCE, imageRatio } from '../Evidence/evidence';
import { styles as evidenceStyles } from '../Evidence/styles';
import { styles } from './styles';
import type { AcceptanceCheck, AcceptanceCheckReviewEntry, AcceptanceEvidence } from './types';

/**
 * The user's acceptance, rendered as one quiet gray line — a signature, not an
 * event card: the verdict icon stays the row's headline, this is metadata.
 */
export const AcceptedNote = memo<{ review: AcceptanceCheckReviewEntry }>(({ review }) => {
  const { t } = useTranslation('verify');
  const hydrated = useIsHydrated();
  return (
    <div className="flex items-center gap-1.5">
      <BadgeCheck color={'var(--ant-color-text-quaternary)'} size={13} />
      <div className="text-[12px] text-muted-foreground">
        {t('acceptance.review.acceptedNote', {
          time: hydrated ? formatAbsoluteDateTime(review.createdAt) : '',
        })}
      </div>
    </div>
  );
});

export const IgnoredNote = memo<{ review: AcceptanceCheckReviewEntry }>(({ review }) => {
  const { t } = useTranslation('verify');
  const hydrated = useIsHydrated();
  return (
    <div className="flex items-center gap-1.5">
      <Ban color={'var(--ant-color-text-quaternary)'} size={13} />
      <div className="text-[12px] text-muted-foreground">
        {t('acceptance.review.ignoredNote', {
          time: hydrated ? formatAbsoluteDateTime(review.createdAt) : '',
        })}
      </div>
    </div>
  );
});

/**
 * One reject-feedback event: a small red marker line, then the note and the
 * circled regions as plain content — no background wash. Used both as the
 * standing feedback under the row's evidence and inside the iteration history.
 */
export const FeedbackCard = memo<{
  evidenceById: Map<string, AcceptanceEvidence>;
  review: AcceptanceCheckReviewEntry;
}>(({ evidenceById, review }) => {
  const { t } = useTranslation('verify');
  const hydrated = useIsHydrated();
  if (review.action === 'accept') return <AcceptedNote review={review} />;
  if (review.action === 'ignore') return <IgnoredNote review={review} />;

  const groups = new Map<
    string,
    { comment?: string; rect: AcceptanceReviewAnnotation['rect'] }[]
  >();
  for (const annotation of review.annotations ?? []) {
    const bucket = groups.get(annotation.evidenceId) ?? [];
    bucket.push({ comment: annotation.comment, rect: annotation.rect });
    groups.set(annotation.evidenceId, bucket);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5">
        <MessageSquareX color={'var(--destructive)'} size={13} />
        <div style={{ color: 'var(--destructive)', fontSize: 12 }}>
          {t('acceptance.review.feedbackLabel')}
        </div>
        <div className="text-[12px] text-muted-foreground">
          {hydrated ? formatAbsoluteDateTime(review.createdAt) : null}
        </div>
      </div>
      {review.comment && <div style={{ fontSize: 12 }}>{review.comment}</div>}
      <AttachmentThumbs attachments={review.attachments} />
      {[...groups.entries()].map(([evidenceId, annotations]) => {
        const evidence = evidenceById.get(evidenceId);
        // The evidence may be gone (deleted round) — the notes stay readable.
        if (!evidence?.fileUrl)
          return annotations
            .filter((annotation) => annotation.comment)
            .map((annotation, index) => (
              <div className="text-[12px] text-muted-foreground" key={`${evidenceId}-${index}`}>
                {annotation.comment}
              </div>
            ));
        return (
          <AnnotatedImage
            annotations={annotations}
            key={evidenceId}
            src={evidence.fileUrl}
            imageStyle={{
              // Known dimensions reserve the box up front (explicit height +
              // ratio-derived width) — no height jump when the row expands
              // and the screenshot streams in.
              aspectRatio: imageRatio(evidence),
              height: evidence.fileHeight ? Math.min(evidence.fileHeight, 240) : undefined,
              maxHeight: 240,
            }}
          />
        );
      })}
    </div>
  );
});

/** Everything a check knows about its evidence, keyed by id — annotation lookups. */
export const collectEvidenceById = (check: AcceptanceCheck): Map<string, AcceptanceEvidence> => {
  const map = new Map<string, AcceptanceEvidence>();
  for (const entry of check.timeline) for (const item of entry.evidence) map.set(item.id, item);
  for (const item of check.evidence) map.set(item.id, item);
  return map;
};

/** A step of the merged history: an executed round, or a user feedback event. */
type HistoryStep =
  | { key: string; kind: 'review'; review: AcceptanceCheckReviewEntry; roundIndex: number }
  | { key: string; kind: 'run'; roundIndex: number; step: AcceptanceCheck['timeline'][number] };

/**
 * The iteration-history timeline (newest first): each executed step's round,
 * the wording THAT round used, and its evidence — plus the user's feedback
 * events, slotted after the round they judged — how the check evolved.
 */
export const IterationTimeline = memo<{
  check: AcceptanceCheck;
  evidenceById: Map<string, AcceptanceEvidence>;
  historyReviews: AcceptanceCheckReviewEntry[];
  onRound?: (round: number) => void;
}>(({ check, evidenceById, historyReviews, onRound }) => {
  const { t } = useTranslation('verify');

  const merged: HistoryStep[] = [
    ...check.timeline.map<HistoryStep>((step) => ({
      key: `run-${step.roundIndex}-${step.resultId}`,
      kind: 'run',
      roundIndex: step.roundIndex,
      step,
    })),
    ...historyReviews.map<HistoryStep>((review) => ({
      key: `review-${review.id}`,
      kind: 'review',
      review,
      roundIndex: review.roundIndex,
    })),
  ]
    .sort(
      (a, b) =>
        a.roundIndex - b.roundIndex ||
        // Within a round the run comes first — feedback judges its result.
        (a.kind === 'review' ? 1 : 0) - (b.kind === 'review' ? 1 : 0) ||
        (a.kind === 'review' && b.kind === 'review'
          ? new Date(a.review.createdAt).getTime() - new Date(b.review.createdAt).getTime()
          : 0),
    )
    .reverse();

  return (
    <div className="flex flex-col">
      {merged.map((entry, index) => {
        const isCurrent = index === 0;
        const isLast = index === merged.length - 1;

        if (entry.kind === 'review')
          return (
            <div className="flex gap-3" key={entry.key}>
              <div className="flex flex-col items-center" style={{ flex: 'none', width: 9 }}>
                <span
                  className={styles.stepDot}
                  style={{
                    borderColor:
                      entry.review.action === 'accept'
                        ? 'var(--success)'
                        : entry.review.action === 'ignore'
                          ? 'var(--ant-color-text-quaternary)'
                          : 'var(--destructive)',
                  }}
                />
                {!isLast && <div className={styles.stepRail} />}
              </div>
              <div
                className="flex flex-col flex-1 gap-1.5"
                style={{ minWidth: 0, paddingBlockEnd: isLast ? 0 : 20 }}
              >
                <FeedbackCard evidenceById={evidenceById} review={entry.review} />
              </div>
            </div>
          );

        const { step } = entry;
        const stateColor =
          {
            failed: 'var(--destructive)',
            passed: 'var(--success)',
            uncertain: 'var(--warning)',
          }[step.state as string] ?? 'var(--ant-color-text-quaternary)';

        return (
          <div className="flex gap-3" key={entry.key}>
            <div className="flex flex-col items-center" style={{ flex: 'none', width: 9 }}>
              <span
                className={styles.stepDot}
                style={{
                  background: isCurrent ? stateColor : 'var(--card)',
                  borderColor: isCurrent ? stateColor : 'var(--ant-color-text-quaternary)',
                }}
              />
              {!isLast && <div className={styles.stepRail} />}
            </div>
            <div
              className="flex flex-col flex-1 gap-1.5"
              style={{ minWidth: 0, paddingBlockEnd: isLast ? 0 : 20 }}
            >
              {onRound ? (
                <SimpleTooltip title={t('acceptance.history.jump', { round: step.roundIndex })}>
                  <div
                    {...clickableProps()}
                    className={cn('font-semibold', CLICKABLE_FOCUS_RING)}
                    style={{ cursor: 'pointer', fontSize: 12, lineHeight: '19px' }}
                    onClick={() => onRound(step.roundIndex)}
                  >
                    {t('acceptance.round', { round: step.roundIndex })}
                  </div>
                </SimpleTooltip>
              ) : (
                <div className="font-semibold" style={{ fontSize: 12, lineHeight: '19px' }}>
                  {t('acceptance.round', { round: step.roundIndex })}
                </div>
              )}
              <div style={{ fontSize: 12 }}>{step.title}</div>
              {step.evidence.length > 0 && (
                <div className="flex gap-2 flex-wrap">
                  {step.evidence.map((item) =>
                    item.fileUrl && IMAGE_EVIDENCE.has(item.type) ? (
                      <div
                        className={`flex flex-col ${evidenceStyles.evidenceImage}`}
                        key={item.id}
                      >
                        <Image
                          alt={item.description ?? item.type}
                          loading={'lazy'}
                          src={item.fileUrl}
                          style={{ borderRadius: 0, maxHeight: 160, maxWidth: 280, width: 'auto' }}
                          variant={'borderless'}
                        />
                      </div>
                    ) : item.fileUrl && item.type === 'video' ? (
                      // A player, never an <Image>: pointing an image box at an
                      // mp4 renders a broken thumbnail, not the clip.
                      <video
                        controls
                        key={item.id}
                        src={item.fileUrl}
                        style={{ borderRadius: 8, maxHeight: 160, maxWidth: 280 }}
                      />
                    ) : item.fileUrl && item.type === 'audio' ? (
                      <div key={item.id} style={{ width: '100%' }}>
                        <AudioPlayer
                          fullWidth
                          alt={item.description ?? item.type}
                          downloadFileName={item.fileName ?? 'audio'}
                          url={item.fileUrl}
                        />
                      </div>
                    ) : item.content ? (
                      <div
                        className={evidenceStyles.evidenceText}
                        key={item.id}
                        style={{ maxHeight: 120, maxWidth: 420 }}
                      >
                        {item.content}
                      </div>
                    ) : null,
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
      {check.result?.suggestion && (
        <div className="flex gap-3" style={{ marginBlockStart: 12 }}>
          <div className="text-[12px] text-muted-foreground" style={{ flex: 'none', minWidth: 64 }}>
            {t('acceptance.detail.suggestion')}
          </div>
          <div className="text-[12px] text-muted-foreground">{check.result.suggestion}</div>
        </div>
      )}
    </div>
  );
});
