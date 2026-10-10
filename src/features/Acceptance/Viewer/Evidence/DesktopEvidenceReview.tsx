'use client';

import { cn } from 'cn';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import { ZOOM_STEPS } from '../Review/rejectDraft';
import type { RejectReviewModel } from '../Review/useRejectReview';
import { AttachmentStrip, AttachmentUploadButton } from './attachments';
import { EvidenceStage } from './EvidenceStage';
import { RegionNotes } from './RegionNotes';

const styles = {
  body: 'overflow-hidden flex flex-1 flex-col min-h-0',
  footer: 'flex-none pt-3 border-t border-sidebar-border',
  stageRow: 'flex flex-1 gap-4 min-h-0',
  notes: 'overflow-y-auto flex flex-none flex-col gap-3 w-80 min-w-0',
  thumb:
    'cursor-pointer overflow-hidden w-18 h-12 border-2 border-transparent rounded-(--ant-border-radius) [&_img]:block [&_img]:w-full [&_img]:h-full [&_img]:object-cover',
  thumbActive: 'border-primary',
  zoomBar:
    'absolute z-5 bottom-4 start-1/2 -translate-x-1/2 flex gap-1 items-center py-1 px-2 border border-sidebar-border rounded-[99px] bg-popover shadow-(--shadow-popover)',
  zoomLabel: 'min-w-11 text-[12px] tabular-nums text-muted-foreground text-center',
};

interface DesktopEvidenceReviewProps {
  /** Names the check in the text-only reject, which has no evidence to point at. */
  checkTitle: string;
  model: RejectReviewModel;
}

/**
 * Desktop reject: a wide stage with the region notes parked beside it, and the
 * delivery-wide note plus the decision in a footer that never scrolls away.
 */
export const DesktopEvidenceReview = memo<DesktopEvidenceReviewProps>(({ checkTitle, model }) => {
  const { t } = useTranslation('verify');
  const {
    activeAnnotations,
    activeEvidence,
    attachments,
    canSubmit,
    canvas,
    close,
    comment,
    evidence,
    failed,
    handlePaste,
    hasEvidence,
    loading,
    uploading,
    zoom,
  } = model;

  return (
    <div className={styles.body}>
      {activeEvidence && (
        <div className="flex flex-col flex-1 gap-3" style={{ minHeight: 0 }}>
          <div className="flex flex-col gap-3 h-full" style={{ minHeight: 0 }}>
            {evidence.length > 1 && (
              <div className="flex gap-2" style={{ overflowX: 'auto', flex: 'none' }}>
                {evidence.map((item, index) => (
                  <button
                    aria-pressed={item.id === activeEvidence.id}
                    key={item.id}
                    style={{ flexShrink: 0 }}
                    type={'button'}
                    aria-label={t('acceptance.review.imageNumber', {
                      current: index + 1,
                      total: evidence.length,
                    })}
                    className={cn(
                      styles.thumb,
                      item.id === activeEvidence.id && styles.thumbActive,
                    )}
                    onClick={() => model.selectEvidence(index)}
                  >
                    <img alt={''} src={item.fileUrl} />
                  </button>
                ))}
              </div>
            )}
            <div className={styles.stageRow} style={{ position: 'relative' }}>
              <EvidenceStage
                drawing
                annotations={activeAnnotations}
                src={activeEvidence.fileUrl}
                zoom={zoom}
                onDraw={canvas.onDraw}
                onRemove={canvas.onRemove}
                onUpdate={canvas.onUpdate}
              />
              <div className={styles.zoomBar}>
                <ActionIcon
                  disabled={zoom <= ZOOM_STEPS[0]}
                  icon={ZoomOut}
                  size={'small'}
                  title={t('acceptance.review.zoomOut')}
                  onClick={() => model.stepZoom(-1)}
                />
                <span className={styles.zoomLabel}>{Math.round(zoom * 100)}%</span>
                <ActionIcon
                  disabled={zoom >= ZOOM_STEPS.at(-1)!}
                  icon={ZoomIn}
                  size={'small'}
                  title={t('acceptance.review.zoomIn')}
                  onClick={() => model.stepZoom(1)}
                />
              </div>
              <div className={styles.notes}>
                <div className="flex flex-col gap-0.5">
                  <div className="font-semibold text-[13px]">
                    {t('acceptance.review.regionComments')}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {t('acceptance.review.annotateHint')}
                  </div>
                </div>
                {activeAnnotations.length === 0 && (
                  <div className="text-[12px] text-muted-foreground">
                    {t('acceptance.review.regionCommentsEmpty')}
                  </div>
                )}
                <RegionNotes
                  annotations={activeAnnotations}
                  onChange={model.editAnnotation}
                  onRemove={model.removeAnnotation}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      <div className={styles.footer}>
        {failed && (
          <div className="text-destructive" role={'alert'}>
            {t('acceptance.review.submitFailed')}
          </div>
        )}
        <div className="flex flex-col gap-2.5" style={{ width: '100%' }}>
          <div className="text-[12px] text-muted-foreground">
            {hasEvidence
              ? t('acceptance.review.supplement')
              : t('acceptance.review.rejectDescription', { title: checkTitle })}
          </div>
          <Textarea
            placeholder={t('acceptance.review.rejectPlaceholder')}
            rows={2}
            style={{ maxHeight: '5lh' }}
            value={comment}
            onChange={(event) => model.setComment(event.target.value)}
            onPaste={handlePaste}
          />
          <div className="flex items-start gap-2">
            <div className="flex flex-1 gap-2">
              <AttachmentUploadButton disabled={loading} onFiles={model.uploadFiles} />
              <AttachmentStrip
                attachments={attachments}
                disabled={loading}
                uploading={uploading}
                onRemove={model.removeAttachment}
              />
            </div>
            <Button disabled={loading} onClick={close}>
              {t('acceptance.actions.cancel')}
            </Button>
            <Button
              disabled={!canSubmit}
              loading={loading}
              variant="outline"
              onClick={model.submitReject}
            >
              {t('acceptance.review.confirmReject')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
});

DesktopEvidenceReview.displayName = 'AcceptanceDesktopEvidenceReview';
