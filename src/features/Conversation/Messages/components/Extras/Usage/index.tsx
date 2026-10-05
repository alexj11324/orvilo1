import { HETEROGENEOUS_TYPE_LABELS, isRemoteHeterogeneousType } from '@orvilo/heterogeneous-agents';
import type { ModelPerformance, ModelUsage } from '@orvilo/types';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import isEqual from 'fast-deep-equal';
import { CircleDollarSignIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelIcon } from '@/components/OrviloIcons';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentStore } from '@/store/agent';
import { builtinAgentSelectors } from '@/store/agent/selectors';
import { aiModelSelectors, useAiInfraStore } from '@/store/aiInfra';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { isDev } from '@/utils/env';
import { formatNumber } from '@/utils/format';

import { contextSelectors, useConversationStore } from '../../../../store';
import TokenDetail from './UsageDetail';

export const styles = createStaticStyles(({ css, cssVar }) => ({
  container: css`
    font-size: 12px;
    color: ${cssVar.colorTextQuaternary};
  `,
}));

// Cheap messages don't need a cost callout — only surface it once it's
// expensive enough to matter.
const MIN_DISPLAY_COST = 0.2;

const formatCost = (cost: number) => cost.toFixed(2);

interface UsageProps {
  model: string;
  performance?: ModelPerformance;
  provider: string;
  usage?: ModelUsage;
}

const Usage = memo<UsageProps>(({ model, usage, performance, provider }) => {
  const { t } = useTranslation('chat');
  const onboardingAgentId = useAgentStore(builtinAgentSelectors.webOnboardingAgentId);
  const conversationAgentId = useConversationStore(contextSelectors.agentId);
  // Credit mode already expresses cost in credits — showing USD alongside would conflict.
  const isShowCredit = useGlobalStore(systemStatusSelectors.isShowCredit);
  const displayModel = model;
  const modelCard = useAiInfraStore((s) =>
    aiModelSelectors.getModelCard(displayModel, provider)(s),
  );
  const displayProvider = modelCard?.providerId ?? provider;

  if (!isDev && onboardingAgentId && conversationAgentId === onboardingAgentId) return null;

  // Only remote platform agents (openclaw, hermes) replace the model name with
  // the brand label — they don't expose a real model id. Local CLI agents
  // (claude-code, codex) report their actual model on `turn_metadata` and
  // should keep showing it.
  const heteroName =
    provider && isRemoteHeterogeneousType(provider)
      ? HETEROGENEOUS_TYPE_LABELS[provider]
      : undefined;

  return (
    <div className={cn('flex items-center gap-3 justify-between', styles.container)}>
      {/* The speed describes how this model ran, so it sits with the model name
          rather than in the token/cost cluster. A spelled-out "tok/s" unit rather
          than an icon: at 12px a gauge glyph is indistinguishable from the
          neighbouring coin, so the reader can't tell what the number measures.
          TTFT rides in the hover instead of taking a second inline slot — it's a
          diagnostic, not an at-a-glance metric. */}
      <div className="flex items-center justify-center gap-1.5" style={{ fontSize: 12 }}>
        <div className="flex items-center justify-center gap-1">
          {heteroName || (
            <>
              <ModelIcon model={displayModel} type={'mono'} />
              {modelCard?.displayName || displayModel}
            </>
          )}
        </div>
        {!!performance?.tps && (
          <>
            <span>·</span>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span style={{ display: 'inline-flex' }}>
                      <div className="flex items-center justify-center gap-1">
                        <span>{formatNumber(performance.tps, 1)}</span>
                        <span>{t('messages.tokenDetails.speed.tps.title')}</span>
                      </div>
                    </span>
                  }
                />
                <TooltipContent>
                  <div className="flex flex-col gap-1.5">
                    <span>{t('messages.tokenDetails.speed.tps.tooltip')}</span>
                    {!!performance.ttft && (
                      <div className="flex gap-3 justify-between">
                        <span>{t('messages.tokenDetails.speed.ttft.title')}</span>
                        <span>{formatNumber(performance.ttft / 1000, 2)}s</span>
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </>
        )}
      </div>

      <div className="flex items-center justify-center gap-2">
        {!!usage?.totalTokens && (
          <TokenDetail
            model={displayModel}
            performance={performance}
            provider={displayProvider}
            usage={usage}
          />
        )}
        {!isShowCredit && !!usage?.cost && usage.cost >= MIN_DISPLAY_COST && (
          <div className="flex items-center justify-center gap-0.5">
            <CircleDollarSignIcon />
            {formatCost(usage.cost)}
          </div>
        )}
      </div>
    </div>
  );
}, isEqual);

export default Usage;
