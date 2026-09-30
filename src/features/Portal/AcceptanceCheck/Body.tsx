'use client';

import { Button, Tag, Text, toast } from '@lobehub/ui/base-ui';
import type { VerifyAgentPlanConfig } from '@orvilo/types';
import { createStaticStyles, cx } from 'antd-style';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import {
  checkHeadMeta,
  type CheckReviewInput,
  FocusedCheckDetails,
  useAcceptanceBundle,
} from '@/features/Acceptance';
import { canReviewAcceptance } from '@/features/Acceptance/Viewer/visibility';
import { verifyService } from '@/services/verify';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { useTaskStore } from '@/store/task';

import SimpleEmpty from '../SimpleEmpty';

const styles = createStaticStyles(({ css }) => ({
  body: css`
    overflow-y: auto;
    flex: 1;

    height: 100%;
    min-height: 0;
    padding-block: 0 24px;
    padding-inline: 24px;
  `,
}));

const Body = memo(() => {
  const { t } = useTranslation(['chat', 'verify']);
  // Task detail (and Home) mount the drawer this opens into.
  const openTopicDrawer = useTaskStore((s) => s.openTopicDrawer);

  const portal = useChatStore(chatPortalSelectors.acceptanceCheckPortal);
  const openAcceptance = useChatStore((state) => state.openAcceptance);
  const { data, error, isLoading, mutate } = useAcceptanceBundle(portal?.acceptanceId ?? null);
  const [reviewPending, setReviewPending] = useState(false);
  const check = data?.checks.find((item) => item.id === portal?.checkId);

  /**
   * An agent judge's argument IS its run, so the trace is the reviewable form
   * of its verdict. The button was already rendered here but received no
   * handler, which made it a dead click.
   */
  const openVerifierTrace = async (verifierOperationId: string) => {
    const resolved = await verifyService.getVerifierThread(verifierOperationId);
    if (!resolved?.topicId) return;
    openTopicDrawer(resolved.topicId, {
      title: t('acceptance.checks.viewTrace', { ns: 'verify' }),
    });
  };

  const handleReview = async (input: CheckReviewInput): Promise<boolean> => {
    if (!data) return false;

    try {
      setReviewPending(true);
      await verifyService.reviewChecks({ id: data.acceptance.id, ...input });
      await mutate();
      return true;
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t('taskDetail.acceptance.reviewError'));
      return false;
    } finally {
      setReviewPending(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[100%]">
        <NeuralNetworkLoading size={40} />
      </div>
    );
  }

  if (error || !data || !check) {
    return (
      <div className="flex flex-col items-center justify-center h-[100%]">
        <div className="flex flex-col items-center gap-3">
          <SimpleEmpty description={t('taskDetail.acceptance.loadError')} />
          <Button onClick={() => void mutate()}>{t('taskDetail.acceptance.retry')}</Button>
        </div>
      </div>
    );
  }

  const checkMeta = checkHeadMeta(check);
  const verifierType = check.planItem?.verifierType ?? check.result?.verifierType;
  const planConfig = (check.planItem?.verifierConfig ?? {}) as VerifyAgentPlanConfig;
  const requiredEvidence = planConfig.requiredEvidence ?? [];
  const usesMultimodalLlm = requiredEvidence.some((evidence) => evidence.type === 'screenshot');

  return (
    <div className={cx('flex flex-col gap-4', styles.body)}>
      <div className="flex flex-row items-center gap-2.5">
        <span className="anticon" role="img" style={{ flex: 'none' }}>
          <checkMeta.icon
            color={checkMeta.color}
            fill={'transparent'}
            height={18}
            size={18}
            width={18}
          />
        </span>
        <Text fontSize={16} weight={600}>
          C{check.seq} · {check.title}
        </Text>
      </div>
      {(verifierType || requiredEvidence.length > 0) && (
        <div className="flex flex-row items-center gap-4 flex-wrap">
          {verifierType && (
            <div className="flex flex-row items-center gap-2">
              <Text fontSize={12} type={'secondary'}>
                {t('taskDetail.acceptance.verifier')}
              </Text>
              <Tag>{t(`criterion.verifierType.${verifierType}` as const, { ns: 'verify' })}</Tag>
              {usesMultimodalLlm && <Tag>{t('taskDetail.acceptance.multimodalLlm')}</Tag>}
            </div>
          )}
          {requiredEvidence.length > 0 && (
            <div className="flex flex-row items-center gap-2 flex-wrap">
              <Text fontSize={12} type={'secondary'}>
                {t('taskDetail.acceptance.requiredEvidence')}
              </Text>
              {requiredEvidence.map((evidence) => (
                <Tag key={evidence.type}>
                  {t(`report.evidence.medium.${evidence.type}` as const, { ns: 'verify' })}
                </Tag>
              ))}
            </div>
          )}
        </div>
      )}
      <FocusedCheckDetails
        canReview={canReviewAcceptance(data)}
        check={check}
        reviewPending={reviewPending}
        onOpenTrace={openVerifierTrace}
        onReview={handleReview}
        onRound={() => openAcceptance(data.acceptance.id)}
      />
    </div>
  );
});

Body.displayName = 'AcceptanceCheckPortalBody';

export default Body;
