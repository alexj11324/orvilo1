import { type ModelPerformance, type ModelUsage } from '@orvilo/types';
import { formatUsageValue } from '@orvilo/utils';
import { cssVar } from 'antd-style';
import { BadgeCent, CoinsIcon } from 'lucide-react';
import { createElement, memo } from 'react';
import { useTranslation } from 'react-i18next';

import InfoTooltip from '@/components/InfoTooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { aiModelSelectors, useAiInfraStore } from '@/store/aiInfra';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { formatNumber, formatShortenNumber } from '@/utils/format';

import AnimatedNumber from './AnimatedNumber';
import ModelCard from './ModelCard';
import type { TokenProgressItem } from './TokenProgress';
import TokenProgress from './TokenProgress';
import { getDetailsToken } from './tokens';

interface TokenDetailProps {
  model: string;
  performance?: ModelPerformance;
  provider: string;
  usage: ModelUsage;
}

const TokenDetail = memo<TokenDetailProps>(({ usage, performance, model, provider }) => {
  const { t } = useTranslation('chat');

  // Use systemStatus to manage short-format display state
  const isShortFormat = useGlobalStore(systemStatusSelectors.tokenDisplayFormatShort);
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  const modelCard = useAiInfraStore(aiModelSelectors.getModelCard(model, provider));
  const isShowCredit = useGlobalStore(systemStatusSelectors.isShowCredit) && !!modelCard?.pricing;

  const detailTokens = getDetailsToken(usage, modelCard);
  const inputDetails = [
    !!detailTokens.inputAudio && {
      color: cssVar.cyan9,
      id: 'reasoning',
      title: t('messages.tokenDetails.inputAudio'),
      value: isShowCredit ? detailTokens.inputAudio.credit : detailTokens.inputAudio.token,
    },
    !!detailTokens.inputCitation && {
      color: cssVar.orange,
      id: 'inputText',
      title: t('messages.tokenDetails.inputCitation'),
      value: isShowCredit ? detailTokens.inputCitation.credit : detailTokens.inputCitation.token,
    },
    !!detailTokens.inputText && {
      color: cssVar.green,
      id: 'inputText',
      title: t('messages.tokenDetails.inputText'),
      value: isShowCredit ? detailTokens.inputText.credit : detailTokens.inputText.token,
    },
  ].filter(Boolean) as TokenProgressItem[];

  const outputDetails = [
    !!detailTokens.outputReasoning && {
      color: cssVar.pink,
      id: 'reasoning',
      title: t('messages.tokenDetails.reasoning'),
      value: isShowCredit
        ? detailTokens.outputReasoning.credit
        : detailTokens.outputReasoning.token,
    },
    !!detailTokens.outputImage && {
      color: cssVar.purple,
      id: 'outputImage',
      title: t('messages.tokenDetails.outputImage'),
      value: isShowCredit ? detailTokens.outputImage.credit : detailTokens.outputImage.token,
    },
    !!detailTokens.outputAudio && {
      color: cssVar.cyan9,
      id: 'outputAudio',
      title: t('messages.tokenDetails.outputAudio'),
      value: isShowCredit ? detailTokens.outputAudio.credit : detailTokens.outputAudio.token,
    },
    !!detailTokens.outputText && {
      color: cssVar.green,
      id: 'outputText',
      title: t('messages.tokenDetails.outputText'),
      value: isShowCredit ? detailTokens.outputText.credit : detailTokens.outputText.token,
    },
  ].filter(Boolean) as TokenProgressItem[];

  const totalDetail = [
    !!detailTokens.inputCacheMiss && {
      color: cssVar.colorFill,

      id: 'uncachedInput',
      title: t('messages.tokenDetails.inputUncached'),
      value: isShowCredit ? detailTokens.inputCacheMiss.credit : detailTokens.inputCacheMiss.token,
    },
    !!detailTokens.inputCached && {
      color: cssVar.orange,
      id: 'inputCached',
      title: t('messages.tokenDetails.inputCached'),
      value: isShowCredit ? detailTokens.inputCached.credit : detailTokens.inputCached.token,
    },
    !!detailTokens.inputCachedWrite && {
      color: cssVar.yellow,
      id: 'cachedWriteInput',
      title: t('messages.tokenDetails.inputWriteCached'),
      value: isShowCredit
        ? detailTokens.inputCachedWrite.credit
        : detailTokens.inputCachedWrite.token,
    },
    !!detailTokens.inputTool && {
      color: cssVar.geekblue,
      id: 'inputTool',
      title: t('messages.tokenDetails.inputTool'),
      value: isShowCredit ? detailTokens.inputTool.credit : detailTokens.inputTool.token,
    },
    !!detailTokens.totalOutput && {
      color: cssVar.colorSuccess,
      id: 'output',
      title: t('messages.tokenDetails.output'),
      value: isShowCredit ? detailTokens.totalOutput.credit : detailTokens.totalOutput.token,
    },
  ].filter(Boolean) as TokenProgressItem[];

  const totalCount =
    isShowCredit && !!detailTokens.totalTokens
      ? detailTokens.totalTokens.credit
      : detailTokens.totalTokens!.token;

  const detailTotal = formatUsageValue(totalCount);
  const cacheRate =
    typeof detailTokens.inputCacheRate === 'number'
      ? `${formatNumber(detailTokens.inputCacheRate * 100, 1)}%`
      : undefined;

  const averagePricing = formatNumber(
    detailTokens.totalTokens!.credit / detailTokens.totalTokens!.token,
    2,
  );

  const tps = performance?.tps ? formatNumber(performance.tps, 2) : undefined;
  const ttft = performance?.ttft ? formatNumber(performance.ttft / 1000, 2) : undefined;

  return (
    <Popover>
      <PopoverContent side="top">
        <div className="flex flex-col gap-2" style={{ minWidth: 200 }}>
          {modelCard && <ModelCard {...modelCard} provider={provider} />}

          <div className="flex flex-col gap-5">
            {inputDetails.length > 1 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 justify-between" style={{ width: '100%' }}>
                  <div style={{ color: cssVar.colorTextDescription, fontSize: 12 }}>
                    {t('messages.tokenDetails.inputTitle')}
                  </div>
                </div>
                <TokenProgress showIcon data={inputDetails} />
              </div>
            )}
            {outputDetails.length > 1 && (
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-1 justify-between" style={{ width: '100%' }}>
                  <div style={{ color: cssVar.colorTextDescription, fontSize: 12 }}>
                    {t('messages.tokenDetails.outputTitle')}
                  </div>
                </div>
                <TokenProgress showIcon data={outputDetails} />
              </div>
            )}
            <div className="flex flex-col">
              <TokenProgress showIcon data={totalDetail} />
              <Separator style={{ marginBlock: 8 }} />
              {cacheRate && (
                <div className="flex items-center gap-1 justify-between">
                  <div style={{ color: cssVar.colorTextSecondary }}>
                    {t('messages.tokenDetails.cacheRate')}
                  </div>
                  <div style={{ fontWeight: 500 }}>{cacheRate}</div>
                </div>
              )}
              <div className="flex items-center gap-1 justify-between">
                <div style={{ color: cssVar.colorTextSecondary }}>
                  {t('messages.tokenDetails.total')}
                </div>
                <div style={{ fontWeight: 500 }}>{detailTotal}</div>
              </div>
              {isShowCredit && (
                <div className="flex items-center gap-1 justify-between">
                  <div style={{ color: cssVar.colorTextSecondary }}>
                    {t('messages.tokenDetails.average')}
                  </div>
                  <div style={{ fontWeight: 500 }}>{averagePricing}</div>
                </div>
              )}
              {tps && (
                <div className="flex items-center gap-1 justify-between">
                  <div className="flex gap-2">
                    <div style={{ color: cssVar.colorTextSecondary }}>
                      {t('messages.tokenDetails.speed.tps.title')}
                    </div>
                    <InfoTooltip title={t('messages.tokenDetails.speed.tps.tooltip')} />
                  </div>
                  <div style={{ fontWeight: 500 }}>{tps}</div>
                </div>
              )}
              {ttft && (
                <div className="flex items-center gap-1 justify-between">
                  <div className="flex gap-2">
                    <div style={{ color: cssVar.colorTextSecondary }}>
                      {t('messages.tokenDetails.speed.ttft.title')}
                    </div>
                    <InfoTooltip title={t('messages.tokenDetails.speed.ttft.tooltip')} />
                  </div>
                  <div style={{ fontWeight: 500 }}>{ttft}s</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </PopoverContent>
      <PopoverTrigger
        openOnHover
        render={
          <div
            className="flex items-center justify-center gap-0.5"
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              // Prevent Popover from closing and toggle the format
              e.preventDefault();
              e.stopPropagation();
              updateSystemStatus({ tokenDisplayFormatShort: !isShortFormat });
            }}
          >
            {createElement(isShowCredit ? BadgeCent : CoinsIcon, {})}
            <AnimatedNumber
              duration={1500}
              // Force remount when switching between token/credit to prevent unwanted animation
              key={isShowCredit ? 'credit' : 'token'}
              value={totalCount}
              formatter={(value) => {
                const roundedValue = Math.round(value);
                if (isShortFormat) {
                  return (formatShortenNumber(roundedValue) as string).toLowerCase?.();
                }
                return new Intl.NumberFormat('en-US').format(roundedValue);
              }}
            />
          </div>
        }
      />
    </Popover>
  );
});

export default TokenDetail;
