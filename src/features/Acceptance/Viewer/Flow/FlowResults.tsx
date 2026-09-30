'use client';

import { ActionIcon, Button, Select, Text, toast } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ClipboardCheck, History, X } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Textarea } from '@/components/ui/textarea';
import { type AcceptanceBundle, verifyService } from '@/services/verify';

import { AttachmentThumbs } from '../Evidence/attachments';
import { EvidenceList } from '../Evidence/EvidenceList';
import { openCheckRejectModal } from '../Review/CheckRejectModal';
import { flowStateColor } from './FlowNode';

type FlowVersion = AcceptanceBundle['flows'][number]['versions'][number];
type FlowAttempt = FlowVersion['runs'][number]['attempts'][number];

const styles = createStaticStyles(({ css }) => ({
  panel: css`
    overflow: hidden;

    width: 100%;
    height: 100%;
    min-height: 0;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  header: css`
    padding: 16px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  body: css`
    overflow: auto;
    min-height: 0;
    padding: 16px;
  `,
  plan: css`
    font-size: 12px;
    color: ${cssVar.colorTextSecondary};

    summary {
      cursor: pointer;
      padding-block: 6px;
    }
  `,
  observation: css`
    line-height: 1.7;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  `,
  review: css`
    padding-block-start: 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

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
        <Text>
          {t(`flow.review.${attempt.review}`)}
          {attempt.reviewComment ? ` · ${attempt.reviewComment}` : ''}
        </Text>
      )}
      {attempt.reviewDetail?.annotations?.map((annotation, index) => (
        <Text fontSize={12} key={`${annotation.evidenceId}:${index}`}>
          {index + 1}. {annotation.comment}
        </Text>
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
          <Text strong fontSize={16}>
            {node.title}
          </Text>
          {attempt && (
            <div className="flex items-center gap-1" style={{ flex: 'none' }}>
              <ClipboardCheck color={flowStateColor(attempt.verdict)} size={14} />
              <Text fontSize={12} style={{ color: flowStateColor(attempt.verdict) }}>
                {t(`flow.state.${attempt.verdict}`)}
              </Text>
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
          <Text type="secondary">
            {selectedEdge.trigger}
            {selectedEdge.condition ? ` · ${selectedEdge.condition}` : ''}
          </Text>
        )}
        {attempt ? (
          <>
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-1.5">
                <History size={14} />
                <Text fontSize={12} type="secondary">
                  {t('flow.resultHistory', { count: attempts.length })}
                </Text>
              </div>
              <Select
                value={attempt.id}
                options={ordered.map((a, i) => ({
                  value: a.id,
                  label: `${i === 0 ? t('flow.latestResult') : `#${a.sequence}`} · ${edges.find((e) => e.id === a.incomingEdgeId)?.trigger ?? node.title} · ${t(`flow.state.${a.verdict}`)}`,
                }))}
                onChange={(id) => setAttemptId(String(id))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Text fontSize={12} type="secondary">
                {t('flow.actual')}
              </Text>
              <Text className={styles.observation}>{attempt.observation}</Text>
            </div>
          </>
        ) : (
          <Text type="secondary">{t('flow.unvisited')}</Text>
        )}
        <div className="flex flex-col gap-1">
          <Text fontSize={12} type="secondary">
            {t('flow.expected')}
          </Text>
          <Text>{node.expected}</Text>
        </div>
        <details className={styles.plan} open={!attempt}>
          <summary>{t('flow.instruction')}</summary>
          <Text>{node.instruction}</Text>
        </details>
        {attempt && (
          <div className="flex flex-col gap-2.5">
            <Text strong>{t('flow.evidence')}</Text>
            {evidence.length ? (
              <EvidenceList evidence={evidence} overlays={overlays} />
            ) : (
              <Text type="secondary">{t('flow.noAttachments')}</Text>
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
          <Text>
            {t(`flow.review.${attempt.review}`)}
            {attempt.reviewComment ? ` · ${attempt.reviewComment}` : ''}
          </Text>
        )}
      </div>
    </div>
  );
}
