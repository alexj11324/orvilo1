'use client';

import { cn } from 'cn';
import { ClipboardCheck, History, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { type AcceptanceBundle, verifyService } from '@/services/verify';

import { AttachmentThumbs } from '../Evidence/attachments';
import { EvidenceList } from '../Evidence/EvidenceList';
import { openCheckRejectModal } from '../Review/CheckRejectModal';
import { flowStateColor } from './FlowNode';

type FlowVersion = AcceptanceBundle['flows'][number]['versions'][number];
type FlowAttempt = FlowVersion['runs'][number]['attempts'][number];

const styles = {
  panel: 'overflow-hidden w-full h-full min-h-0 border-s border-sidebar-border bg-card',
  header: 'p-4 border-b border-sidebar-border',
  body: 'overflow-auto min-h-0 p-4',
  plan: 'text-[12px] text-muted-foreground [&_summary]:cursor-pointer [&_summary]:py-1.5',
  observation: 'leading-[1.7] wrap-anywhere whitespace-pre-wrap',
  review: 'pt-4 border-t border-sidebar-border',
};

function AttemptReview({
  acceptanceId,
  attempt,
  onSaved,
}: {
  acceptanceId: string;
  attempt: FlowAttempt;
  onSaved: () => Promise<unknown>;
}) {
  const { t } = useTranslation('verify');
  const [editing, setEditing] = useState(false);
  const [comment, setComment] = useState(attempt.reviewComment ?? '');
  const [saving, setSaving] = useState(false);
  return (
    <div className={`flex flex-col gap-2.5 ${styles.review}`}>
      {attempt.review && (
        <div>
          {t(`flow.review.${attempt.review}`)}
          {attempt.reviewComment ? ` · ${attempt.reviewComment}` : ''}
        </div>
      )}
      {attempt.reviewDetail?.annotations?.map((annotation, index) => (
        <div className="text-[12px]" key={`${annotation.evidenceId}:${index}`}>
          {index + 1}. {annotation.comment}
        </div>
      ))}
      <AttachmentThumbs attachments={attempt.reviewAttachments} />
      <Button
        onClick={() =>
          openCheckRejectModal({
            checkTitle: t('flow.annotate'),
            draftKey: attempt.id,
            evidence: attempt.evidence
              .filter((e) => e.type === 'screenshot' && e.fileUrl)
              .map((e) => ({ id: e.id, fileUrl: e.fileUrl! })),
            initialAnnotations: attempt.reviewDetail?.annotations,
            initialComment: comment,
            onConfirm: async (feedback) => {
              try {
                await verifyService.reviewFlowStep({
                  id: acceptanceId,
                  attemptId: attempt.id,
                  review: 'rejected',
                  ...feedback,
                });
                await onSaved();
                setComment(feedback.comment);
                setEditing(false);
                return true;
              } catch (error) {
                console.error(error);
                toast.error(t('flow.saveError'));
                return false;
              }
            },
          })
        }
      >
        {t('flow.annotate')}
      </Button>
      {!editing ? (
        <Button onClick={() => setEditing(true)}>
          {t(attempt.review ? 'flow.editReview' : 'flow.reviewResult')}
        </Button>
      ) : (
        <>
          <Textarea
            placeholder={t('flow.comment')}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="flex gap-2">
            {(['accepted', 'rejected'] as const).map((review) => (
              <Button
                disabled={saving}
                key={review}
                onClick={async () => {
                  setSaving(true);
                  try {
                    await verifyService.reviewFlowStep({
                      id: acceptanceId,
                      attemptId: attempt.id,
                      review,
                      comment,
                      annotations: attempt.reviewDetail?.annotations,
                      fileIds: attempt.reviewDetail?.fileIds,
                    });
                    await onSaved();
                    setEditing(false);
                  } catch (error) {
                    console.error(error);
                    toast.error(t('flow.saveError'));
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                {t(`flow.review.${review}`)}
              </Button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Selecting history and drafting a review only update the reading panel, never the map. */
export function FlowResults({
  acceptanceId,
  attempts,
  canReview,
  edges,
  node,
  onClose,
  onSaved,
  selectedEdge,
}: {
  acceptanceId: string;
  attempts: FlowAttempt[];
  canReview: boolean;
  edges: FlowVersion['edges'];
  node: FlowVersion['nodes'][number];
  onClose: () => void;
  onSaved: () => Promise<unknown>;
  selectedEdge?: FlowVersion['edges'][number];
}) {
  const { t } = useTranslation('verify');
  const [attemptId, setAttemptId] = useState<string>();
  const ordered = [...attempts].reverse();
  const attempt = ordered.find((a) => a.id === attemptId) ?? ordered[0];
  const evidence =
    attempt?.evidence.filter((e) => e.fileUrl || e.content !== attempt.observation) ?? [];
  const overlays = new Map<
    string,
    NonNullable<NonNullable<FlowAttempt['reviewDetail']>['annotations']>
  >();
  for (const annotation of attempt?.reviewDetail?.annotations ?? [])
    overlays.set(annotation.evidenceId, [
      ...(overlays.get(annotation.evidenceId) ?? []),
      annotation,
    ]);
  return (
    <div className={`flex flex-col ${styles.panel}`}>
      <div className={`flex items-center gap-3 justify-between ${styles.header}`}>
        <div className="flex items-center gap-2.5" style={{ flexWrap: 'wrap' }}>
          <div className="font-semibold text-[16px]">{node.title}</div>
          {attempt && (
            <div className="flex items-center gap-1" style={{ flex: 'none' }}>
              <ClipboardCheck color={flowStateColor(attempt.verdict)} size={14} />
              <div className="text-[12px]" style={{ color: flowStateColor(attempt.verdict) }}>
                {t(`flow.state.${attempt.verdict}`)}
              </div>
            </div>
          )}
        </div>
        <ActionIcon
          aria-label={t('flow.closeResults')}
          icon={X}
          title={t('flow.closeResults')}
          onClick={onClose}
        />
      </div>
      <div className={`flex flex-col gap-4 ${styles.body}`}>
        {selectedEdge && (
          <div className="text-muted-foreground">
            {selectedEdge.trigger}
            {selectedEdge.condition ? ` · ${selectedEdge.condition}` : ''}
          </div>
        )}
        {attempt ? (
          <>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5">
                <History size={14} />
                <div className="text-[12px] text-muted-foreground">
                  {t('flow.resultHistory', { count: attempts.length })}
                </div>
              </div>
              <Select
                value={attempt.id}
                items={ordered.map((a, i) => ({
                  value: a.id,
                  label: `${i === 0 ? t('flow.latestResult') : `#${a.sequence}`} · ${edges.find((e) => e.id === a.incomingEdgeId)?.trigger ?? node.title} · ${t(`flow.state.${a.verdict}`)}`,
                }))}
                onValueChange={(id) => setAttemptId(String(id))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ordered.map((a, i) => (
                    <SelectItem key={a.id} value={a.id}>
                      {`${i === 0 ? t('flow.latestResult') : `#${a.sequence}`} · ${edges.find((e) => e.id === a.incomingEdgeId)?.trigger ?? node.title} · ${t(`flow.state.${a.verdict}`)}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-[12px] text-muted-foreground">{t('flow.actual')}</div>
              <div className={cn(styles.observation)}>{attempt.observation}</div>
            </div>
          </>
        ) : (
          <div className="text-muted-foreground">{t('flow.unvisited')}</div>
        )}
        <div className="flex flex-col gap-1">
          <div className="text-[12px] text-muted-foreground">{t('flow.expected')}</div>
          <div>{node.expected}</div>
        </div>
        <details className={styles.plan} open={!attempt}>
          <summary>{t('flow.instruction')}</summary>
          <div>{node.instruction}</div>
        </details>
        {attempt && (
          <div className="flex flex-col gap-2.5">
            <div className="font-semibold">{t('flow.evidence')}</div>
            {evidence.length ? (
              <EvidenceList evidence={evidence} overlays={overlays} />
            ) : (
              <div className="text-muted-foreground">{t('flow.noAttachments')}</div>
            )}
          </div>
        )}
        {attempt && canReview && (
          <AttemptReview
            acceptanceId={acceptanceId}
            attempt={attempt}
            key={attempt.id}
            onSaved={onSaved}
          />
        )}
        {attempt?.review && !canReview && (
          <div>
            {t(`flow.review.${attempt.review}`)}
            {attempt.reviewComment ? ` · ${attempt.reviewComment}` : ''}
          </div>
        )}
      </div>
    </div>
  );
}
