import { getCachedTextInputUnitRate, getWriteCacheInputUnitRate } from '@orvilo/utils';
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

export const styles = {
  container: 'text-sm leading-5.5',
  desc: 'text-xs leading-5 text-foreground-description',
  pricing: 'text-xs leading-5 text-muted-foreground',
};

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
      <div className={cn('flex flex-1 items-center justify-between gap-10', styles.container)}>
        <div className="flex items-center gap-2">
          <ModelIcon model={id} size={22} />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-center gap-2 leading-5.5">{displayName || id}</div>
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
              <TabsList className="rounded-(--radius-button)">
                <TabsTrigger className="rounded-(--radius-input)" value={'token'}>
                  {'Token'}
                </TabsTrigger>
                <TabsTrigger className="rounded-(--radius-input)" value={'credit'}>
                  {
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <span className="inline-flex">
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
                      <span className="inline-flex">
                        <div className="flex gap-0.5">
                          <CircleFadingArrowUp size={14} />
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
                      <span className="inline-flex">
                        <div className="flex gap-0.5">
                          <BookUp2Icon size={14} />
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
                    <span className="inline-flex">
                      <div className="flex gap-0.5">
                        <ArrowUpFromDot size={14} />
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
                    <span className="inline-flex">
                      <div className="flex gap-0.5">
                        <ArrowDownToDot size={14} />
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
        <div className="h-4.5" />
      )}
    </div>
  );
});

export default ModelCard;
