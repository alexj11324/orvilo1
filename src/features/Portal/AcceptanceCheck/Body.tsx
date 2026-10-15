'use client';

import type { VerifyAgentPlanConfig } from '@orvilo/types';
import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import NeuralNetworkLoading from '@/components/NeuralNetworkLoading';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { checkHeadMeta, FocusedCheckDetails, useAcceptanceBundle } from '@/features/Acceptance';
import { verifyService } from '@/services/verify';
import { useChatStore } from '@/store/chat';
import { chatPortalSelectors } from '@/store/chat/selectors';
import { useTaskStore } from '@/store/task';

import SimpleEmpty from '../SimpleEmpty';

const styles = {
  body: 'overflow-y-auto flex-1 h-full min-h-0 [padding-block:0_24px] px-6',
};

const Body = memo(() => {
  const { t } = useTranslation(['chat', 'verify']);
  // Task detail (and Home) mount the drawer this opens into.
  const openTopicDrawer = useTaskStore((s) => s.openTopicDrawer);

  const portal = useChatStore(chatPortalSelectors.acceptanceCheckPortal);
  const openAcceptance = useChatStore((state) => state.openAcceptance);
  const { data, error, isLoading, mutate } = useAcceptanceBundle(portal?.acceptanceId ?? null);
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

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <NeuralNetworkLoading size={40} />
      </div>
    );
  }

  if (error || !data || !check) {
    return (
      <div className="flex flex-col items-center justify-center h-full">
        <div className="flex flex-col items-center gap-3">
          <SimpleEmpty description={t('taskDetail.acceptance.loadError')} />
          <Button variant="outline" onClick={() => void mutate()}>
            {t('taskDetail.acceptance.retry')}
          </Button>
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
    <div className={cn('flex flex-col gap-4', styles.body)}>
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
        <div className="text-base font-semibold">
          C{check.seq} · {check.title}
        </div>
      </div>
      {(verifierType || requiredEvidence.length > 0) && (
        <div className="flex flex-row items-center gap-4 flex-wrap">
          {verifierType && (
            <div className="flex flex-row items-center gap-2">
              <div className="text-xs text-muted-foreground">
                {t('taskDetail.acceptance.verifier')}
              </div>
              <Badge variant="secondary">
                {t(`criterion.verifierType.${verifierType}` as const, { ns: 'verify' })}
              </Badge>
              {usesMultimodalLlm && (
                <Badge variant="secondary">{t('taskDetail.acceptance.multimodalLlm')}</Badge>
              )}
            </div>
          )}
          {requiredEvidence.length > 0 && (
            <div className="flex flex-row items-center gap-2 flex-wrap">
              <div className="text-xs text-muted-foreground">
                {t('taskDetail.acceptance.requiredEvidence')}
              </div>
              {requiredEvidence.map((evidence) => (
                <Badge key={evidence.type} variant="secondary">
                  {t(`report.evidence.medium.${evidence.type}` as const, { ns: 'verify' })}
                </Badge>
              ))}
            </div>
          )}
        </div>
      )}
      <FocusedCheckDetails
        canReview={false}
        check={check}
        reviewPending={false}
        onOpenTrace={openVerifierTrace}
        onReview={async () => false}
        onRound={() => openAcceptance(data.acceptance.id)}
      />
    </div>
  );
});

Body.displayName = 'AcceptanceCheckPortalBody';

export default Body;
