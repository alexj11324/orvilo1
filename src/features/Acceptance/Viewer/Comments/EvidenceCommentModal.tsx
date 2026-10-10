'use client';

import type { AcceptanceReviewAnnotation } from '@orvilo/types';
import { cn } from 'cn';
import { t } from 'i18next';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createModal, useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

import type { AcceptanceEvidence } from '../Checks/types';
import { AnnotationCanvas } from '../Evidence/Annotation';
import { isAnnotatable } from '../Evidence/evidence';

const styles = {
  hint: 'text-[12px] text-(--ant-color-text-tertiary)',
  stage:
    'overflow-auto max-h-[min(60vh,640px)] border border-sidebar-border rounded-[8px] bg-(--ant-color-fill-quaternary)',
  thumb:
    'cursor-pointer overflow-hidden w-16 h-11 border-2 border-transparent rounded-[6px] bg-accent [&_img]:w-full [&_img]:h-full [&_img]:object-cover',
  thumbActive: 'border-primary',
};

export interface EvidenceCommentValue {
  content: string;
  evidenceId: string;
  rect: AcceptanceReviewAnnotation['rect'];
}

interface EvidenceCommentModalProps {
  evidence: AcceptanceEvidence[];
  initialEvidenceId?: string;
  /** Persist the comment; resolve true to close, false to stay open. */
  onConfirm: (value: EvidenceCommentValue) => Promise<boolean>;
}

/**
 * Circle one spot on one screenshot and say what is wrong with it. One region
 * per comment on purpose: a thread is about a place, and two places are two
 * threads.
 */
const EvidenceCommentContent = memo<EvidenceCommentModalProps>(
  ({ evidence, initialEvidenceId, onConfirm }) => {
    const { t } = useTranslation('verify');
    const { close } = useModalContext();
    const images = evidence.filter(isAnnotatable);
    const [activeId, setActiveId] = useState(initialEvidenceId ?? images[0]?.id);
    const [rect, setRect] = useState<AcceptanceReviewAnnotation['rect'] | null>(null);
    const [content, setContent] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const active = images.find((item) => item.id === activeId) ?? images[0];
    const trimmed = content.trim();

    const submit = async () => {
      if (!active || !rect || !trimmed || submitting) return;
      setSubmitting(true);
      try {
        const done = await onConfirm({ content: trimmed, evidenceId: active.id, rect });
        if (done) close();
      } catch (cause) {
        console.error('[acceptance:comments]', cause);
        toast.error(t('acceptance.comments.createFailed'));
      } finally {
        setSubmitting(false);
      }
    };

    if (!active) return null;

    return (
      <div className="flex flex-col gap-3" style={{ padding: 16 }}>
        <span className={styles.hint}>{t('acceptance.comments.regionHint')}</span>
        {images.length > 1 && (
          <div className="flex gap-2 flex-wrap">
            {images.map((item) => (
              <div
                aria-pressed={item.id === active.id}
                className={cn(styles.thumb, item.id === active.id && styles.thumbActive)}
                key={item.id}
                role={'button'}
                onClick={() => {
                  setActiveId(item.id);
                  setRect(null);
                }}
              >
                <img alt={item.description ?? item.type} src={item.fileUrl!} />
              </div>
            ))}
          </div>
        )}
        <div className={styles.stage}>
          <AnnotationCanvas
            annotations={rect ? [{ comment: '', rect }] : []}
            src={active.fileUrl!}
            onDraw={setRect}
            onRemove={() => setRect(null)}
            onUpdate={(_index, next) => setRect(next)}
          />
        </div>
        <Textarea
          autoFocus
          placeholder={t('acceptance.comments.placeholder')}
          rows={2}
          style={{ maxHeight: '6lh' }}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="flex items-center gap-2 justify-end">
          {!rect && (
            <div className="text-[12px] text-muted-foreground">
              {t('acceptance.comments.regionMissing')}
            </div>
          )}
          <Button
            disabled={!rect || !trimmed}
            loading={submitting}
            variant="outline"
            onClick={() => void submit()}
          >
            {t('acceptance.comments.send')}
          </Button>
        </div>
      </div>
    );
  },
);

EvidenceCommentContent.displayName = 'AcceptanceEvidenceCommentContent';

export const openEvidenceCommentModal = (options: EvidenceCommentModalProps) =>
  createModal({
    content: <EvidenceCommentContent {...options} />,
    footer: null,
    maskClosable: true,
    styles: { content: { padding: 0 } },
    title: t('acceptance.comments.regionModalTitle', { ns: 'verify' }),
    width: 'min(880px, 92vw)',
  });
