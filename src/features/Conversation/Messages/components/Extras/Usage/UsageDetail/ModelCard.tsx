import { getCachedTextInputUnitRate, getWriteCacheInputUnitRate } from '@orvilo/utils';
import { createStaticStyles } from 'antd-style';
import { cn } from 'cn';
import { ArrowDownToDot, ArrowUpFromDot, BookUp2Icon, CircleFadingArrowUp } from 'lucide-react';
import { type OrviloDefaultAiModelListItem } from 'model-bank';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ModelIcon } from '@/components/OrviloIcons';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { getPrice } from './pricing';

export const styles = createStaticStyles(({ css, cssVar }) => {
  return {
    container: css`
      font-size: 12px;
    `,
    desc: css`
      line-height: 12px;
      color: ${cssVar.colorTextDescription};
    `,
    pricing: css`
      font-size: 12px;
      color: ${cssVar.colorTextSecondary};
    `,
  };
});

interface ModelCardProps extends OrviloDefaultAiModelListItem {
  provider: string;
}

const ModelCard = memo<ModelCardProps>(({ pricing, id, provider, displayName }) => {
  const { t } = useTranslation('chat');

  const isShowCredit = useGlobalStore(systemStatusSelectors.isShowCredit) && !!pricing;
  const updateSystemStatus = useGlobalStore((s) => s.updateSystemStatus);

  const formatPrice = getPrice(pricing || { units: [] });

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn('flex items-center flex-1 justify-between', styles.container)}
        style={{ gap: 40 }}
      >
        <div className="flex items-center gap-2">
          <ModelIcon model={id} size={22} />
          <div className="flex flex-col flex-1 gap-0.5" style={{ minWidth: 0 }}>
            <div className="flex items-center gap-2" style={{ lineHeight: '12px' }}>
              {displayName || id}
            </div>
            <span className={styles.desc}>{provider}</span>
          </div>
        </div>
        {!!pricing && (
          <div className="flex flex-col">
            <Tabs
              value={isShowCredit ? 'credit' : 'token'}
              onValueChange={(key) => {
                updateSystemStatus({ isShowCredit: key === 'credit' });
              }}
            >
              <TabsList>
                <TabsTrigger value={'token'}>{'Token'}</TabsTrigger>
                <TabsTrigger value={'credit'}>
                  {
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span style={{ display: 'inline-flex' }}>
                              <span>{t('messages.modelCard.credit')}</span>
                            </span>
                          }
                        />
                        <TooltipContent>{t('messages.modelCard.creditTooltip')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  }
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        )}
      </div>
      {isShowCredit ? (
        <div className="flex justify-between">
          <div />
          <div className={cn('flex items-center gap-2', styles.pricing)}>
            {t('messages.modelCard.creditPricing')}:
            {getCachedTextInputUnitRate(pricing) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span style={{ display: 'inline-flex' }}>
                        <div className="flex gap-0.5">
                          <CircleFadingArrowUp />
                          {formatPrice.cachedInput}
                        </div>
                      </span>
                    }
                  />
                  <TooltipContent>
                    {t('messages.modelCard.pricing.inputCachedTokens', {
                      amount: formatPrice.cachedInput,
                    })}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {getWriteCacheInputUnitRate(pricing) && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span style={{ display: 'inline-flex' }}>
                        <div className="flex gap-0.5">
                          <BookUp2Icon />
                          {formatPrice.writeCacheInput}
                        </div>
                      </span>
                    }
                  />
                  <TooltipContent>
                    {t('messages.modelCard.pricing.writeCacheInputTokens', {
                      amount: formatPrice.writeCacheInput,
                    })}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span style={{ display: 'inline-flex' }}>
                      <div className="flex gap-0.5">
                        <ArrowUpFromDot />
                        {formatPrice.input}
                      </div>
                    </span>
                  }
                />
                <TooltipContent>
                  {t('messages.modelCard.pricing.inputTokens', { amount: formatPrice.input })}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <span style={{ display: 'inline-flex' }}>
                      <div className="flex gap-0.5">
                        <ArrowDownToDot />
                        {formatPrice.output}
                      </div>
                    </span>
                  }
                />
                <TooltipContent>
                  {t('messages.modelCard.pricing.outputTokens', { amount: formatPrice.output })}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      ) : (
        <div style={{ height: 18 }} />
      )}
    </div>
  );
});

export default ModelCard;
