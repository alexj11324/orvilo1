'use client';

import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

import { ZOOM_STEPS } from '../Review/rejectDraft';
import type { RejectReviewModel } from '../Review/useRejectReview';
import { AttachmentStrip, AttachmentUploadButton } from './attachments';
import { EvidenceStage } from './EvidenceStage';
import { MobileRegionNotes } from './RegionNotes';

const styles = {
  body: 'flex flex-1 flex-col min-w-0 min-h-0',
  scroll: 'overflow-y-auto overscroll-contain flex flex-1 flex-col gap-2 min-h-0 pb-3',
  stage: 'flex flex-none h-[42dvh] min-h-[220px]',
  editor: 'flex flex-none flex-col gap-4 pt-1 [&_textarea]:text-[16px]',
  footer: 'flex flex-none flex-col gap-2 pt-2 border-t border-sidebar-border [&>button]:min-h-11',
};

/**
 * Phone review on one page: look at the image, circle what is wrong, and write
 * the note right where the circle landed.
 */
export const MobileEvidenceReview = memo<{ model: RejectReviewModel }>(({ model }) => {
  const { t } = useTranslation('verify');
  const {
    activeAnnotations,
    activeEvidence,
    activeIndex,
    annotations,
    attachments,
    canSubmit,
    canvas,
    comment,
    drawing,
    evidence,
    failed,
    handlePaste,
    loading,
    uploading,
    zoom,
  } = model;

  return (
    <div className={styles.body}>
      <div className={styles.scroll}>
        {activeEvidence && (
          <>
            <div className="flex items-center gap-2" style={{ flex: 'none' }}>
              <ActionIcon
                aria-label={t('acceptance.review.previousImage')}
                disabled={activeIndex <= 0}
                icon={ChevronLeft}
                size={{ blockSize: 44, size: 20 }}
                onClick={() => model.selectEvidence(activeIndex - 1)}
              />
              <div aria-live={'polite'} style={{ flex: 1, textAlign: 'center' }}>
                {t('acceptance.review.imageNumber', {
                  current: activeIndex + 1,
                  total: evidence.length,
                })}
              </div>
              <ActionIcon
                aria-label={t('acceptance.review.nextImage')}
                disabled={activeIndex >= evidence.length - 1}
                icon={ChevronRight}
                size={{ blockSize: 44, size: 20 }}
                onClick={() => model.selectEvidence(activeIndex + 1)}
              />
            </div>
            <div className={styles.stage}>
              <EvidenceStage
                touch
                annotations={activeAnnotations}
                drawing={drawing}
                src={activeEvidence.fileUrl}
                zoom={zoom}
                onDraw={canvas.onDraw}
                onRemove={canvas.onRemove}
                onSwipe={(direction) => model.selectEvidence(activeIndex + direction)}
                onUpdate={canvas.onUpdate}
              />
            </div>
            <div className="flex items-center gap-2" style={{ flex: 'none' }}>
              {/* A mode switch, not an action button. A single button labelled
                  with the mode it would LEAVE says nothing about which mode is
                  on, and its 44px slab sat oddly beside the small zoom icons. */}
              <ToggleGroup
                size="sm"
                value={[drawing ? 'draw' : 'browse']}
                onValueChange={(value) => {
                  if (value.length > 0 && (value[0] === 'draw') !== drawing)
                    model.advance('toggle-draw');
                }}
              >
                <ToggleGroupItem value="browse">
                  {t('acceptance.review.browseImage')}
                </ToggleGroupItem>
                <ToggleGroupItem value="draw">{t('acceptance.review.drawRegion')}</ToggleGroupItem>
              </ToggleGroup>
              <div className="flex flex-col flex-1" />
              <ActionIcon
                aria-label={t('acceptance.review.zoomOut')}
                disabled={zoom <= ZOOM_STEPS[0]}
                icon={ZoomOut}
                size={{ blockSize: 44, size: 20 }}
                onClick={() => model.stepZoom(-1)}
              />
              <div className="text-[12px]">{Math.round(zoom * 100)}%</div>
              <ActionIcon
                aria-label={t('acceptance.review.zoomIn')}
                disabled={zoom >= ZOOM_STEPS.at(-1)!}
                icon={ZoomIn}
                size={{ blockSize: 44, size: 20 }}
                onClick={() => model.stepZoom(1)}
              />
            </div>
            {/* The hint is the region's receipt: it says the box landed AND
                that it is still editable, right above the note it belongs to. */}
            <div className="text-[12px] text-muted-foreground" style={{ flex: 'none' }}>
              {drawing && activeAnnotations.length > 0
                ? t('acceptance.review.mobileDrawnHint', { count: activeAnnotations.length })
                : t(
                    drawing
                      ? 'acceptance.review.mobileDrawHint'
                      : 'acceptance.review.mobileBrowseHint',
                  )}
            </div>
          </>
        )}
        <div className={styles.editor}>
          {annotations.length > 0 && (
            <>
              <div className="font-semibold">{t('acceptance.review.regionComments')}</div>
              <MobileRegionNotes
                annotations={annotations}
                evidence={evidence}
                onChange={model.editAnnotation}
                onJump={model.jumpToRegion}
                onRemove={model.removeAnnotation}
              />
            </>
          )}
          <div className="font-semibold">{t('acceptance.review.supplement')}</div>
          <Textarea
            aria-label={t('acceptance.review.supplement')}
            placeholder={t('acceptance.review.rejectPlaceholder')}
            rows={4}
            style={{ fontSize: 16, maxHeight: '10lh' }}
            value={comment}
            onChange={(event) => model.setComment(event.target.value)}
            onPaste={handlePaste}
          />
          <AttachmentUploadButton disabled={loading} onFiles={model.uploadFiles} />
          <AttachmentStrip
            attachments={attachments}
            disabled={loading}
            uploading={uploading}
            onRemove={model.removeAttachment}
          />
          <div className="text-[12px] text-muted-foreground">
            {t('acceptance.review.draftSaved')}
          </div>
        </div>
      </div>
      <div className={styles.footer}>
        {failed && (
          <div className="text-destructive" role={'alert'}>
            {t('acceptance.review.submitFailed')}
          </div>
        )}
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
  );
});

MobileEvidenceReview.displayName = 'AcceptanceMobileEvidenceReview';
