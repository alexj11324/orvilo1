import { Flexbox, Icon } from '@lobehub/ui';
import {
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionRoot,
  AccordionTrigger,
  Text,
} from '@lobehub/ui/base-ui';
import { ArrowDownToDot, ArrowUpFromDot, CircleFadingArrowUp } from 'lucide-react';
import type { FC } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, type BadgeProps } from '@/components/reui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { EnabledProviderWithModels } from '@/types/aiProvider';
import { getModelDescriptionI18nKey } from '@/utils/modelDescriptionI18n';

import type { FormattedUnitPrice } from '../hooks/useModelDetailPanel';
import { UNIT_ICON_MAP, useModelDetailPanel } from '../hooks/useModelDetailPanel';
import type { PricingMode } from '../types';
import { openBenchmarkModal } from './BenchmarkModal';
import type { RadarDimensionDatum } from './ModelRatingRadar';
import ModelRatingRadar, {
  RADAR_MIN_DIMENSIONS,
  RATING_DIMENSION_ORDER,
  RATING_SOURCE_NAMES,
} from './ModelRatingRadar';

export type { PricingMode } from '../types';

/** Ability colors from `useModelDetailPanel` mapped onto badge roles; others stay neutral. */
const ABILITY_BADGE_VARIANTS: Record<string, BadgeProps['variant']> = {
  gold: 'warning-light',
  info: 'info-light',
  success: 'success-light',
};

const styles = {
  actionText: 'text-sm leading-5.5 font-medium text-foreground',
  container: 'pb-2',
  description: 'm-0 px-2 py-2 wrap-anywhere whitespace-pre-wrap',
  radarClickable:
    'cursor-pointer rounded-(--radius-card) transition-[background] duration-(--orvilo-motion-mid) ease-[var(--orvilo-motion-ease-in-out)] hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none',
  ratingScoreLink:
    'inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary-text',
  row: 'px-2 py-1 text-sm leading-5.5 text-muted-foreground',
  originalPriceText: 'text-muted-foreground line-through',
  priceValue: 'inline-flex items-baseline gap-1',
  titleText: 'text-sm leading-5.5 font-normal text-muted-foreground',
};

interface PriceValueProps {
  prefix?: string;
  price: FormattedUnitPrice;
  suffix?: string;
}

const PriceValue: FC<PriceValueProps> = ({ price, prefix = '', suffix = '' }) => (
  <span className={styles.priceValue}>
    {price.original && (
      <span className={styles.originalPriceText}>
        {prefix}
        {price.original}
      </span>
    )}
    <span>
      {prefix}
      {price.current}
      {suffix}
    </span>
  </span>
);

interface ModelDetailPanelProps {
  enabledList?: EnabledProviderWithModels[];
  model?: string;
  pricingMode?: PricingMode;
  provider?: string;
}

const ModelDetailPanel: FC<ModelDetailPanelProps> = memo(
  ({ model: modelId, provider, enabledList: enabledListProp, pricingMode }) => {
    const { t } = useTranslation(['components', 'models']);
    const {
      approximatePriceLabel,
      contextWindowLabel,
      enabledAbilities,
      expandedKeys,
      formatPrice,
      formatUnitPrice,
      getPricingTooltip,
      getUnitPriceSuffix,
      handleExpandedChange,
      hasAbilities,
      hasCachedInputPricing,
      hasPricing,
      isAbilitiesExpanded,
      isCreditPricing,
      isPricingExpanded,
      model,
      pricingGroups,
      rating,
    } = useModelDetailPanel({
      enabledList: enabledListProp,
      modelId,
      pricingMode,
      provider,
      t,
    });

    if (!model) return null;

    const ratingDimensions: RadarDimensionDatum[] = rating
      ? RATING_DIMENSION_ORDER.map((key) => {
          const dimension = rating[key];

          return {
            key,
            label: String(t(`ModelSwitchPanel.detail.rating.dimension.${key}` as any)),
            score: dimension?.score,
            sourceUrl: dimension?.sourceUrl,
            tooltip: dimension
              ? `${RATING_SOURCE_NAMES[dimension.source]}${
                  dimension.raw === undefined ? '' : ` · ${dimension.raw}`
                }`
              : undefined,
          };
        })
      : [];
    const ratedDimensions = ratingDimensions.filter((item) => item.score !== undefined);
    const hasRating = ratedDimensions.length > 0;

    // Model ids can contain `:` (e.g. `gemini-3-pro-image-preview:image`). i18next
    // defaults nsSeparator to `:`, so without disabling it the lookup splits into the
    // wrong namespace and never hits `models.orvilo.<id>.description`.
    const description = model.description
      ? String(
          t(getModelDescriptionI18nKey(model.id, provider) as any, {
            defaultValue: model.description,
            keySeparator: false,
            ns: 'models',
            nsSeparator: false,
          }),
        ).trim()
      : undefined;

    return (
      <Flexbox className={styles.container}>
        {description && (
          <Text
            as={'p'}
            className={styles.description}
            fontSize={14}
            lineHeight={'22px'}
            type={'secondary'}
          >
            {description}
          </Text>
        )}
        {/* Sections */}
        {(hasRating || hasPricing || contextWindowLabel || hasAbilities) && (
          <AccordionRoot
            indicatorPlacement="inline"
            style={{ gap: 8 }}
            value={expandedKeys}
            onValueChange={handleExpandedChange}
          >
            {/* Benchmarks */}
            {hasRating && (
              <AccordionItem value="rating">
                <AccordionHeader>
                  <AccordionTrigger style={{ paddingBlock: 6, paddingInline: 8 }}>
                    <Flexbox horizontal align={'center'} gap={8}>
                      <div className="h-3.5 w-px shrink-0 rounded-full bg-border" />
                      <span className={styles.titleText}>
                        {t('ModelSwitchPanel.detail.rating')}
                      </span>
                    </Flexbox>
                  </AccordionTrigger>
                </AccordionHeader>
                <AccordionPanel>
                  <Flexbox gap={4}>
                    {ratedDimensions.length >= RADAR_MIN_DIMENSIONS ? (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <div
                              className={styles.radarClickable}
                              role={'button'}
                              tabIndex={0}
                              onClick={() => {
                                if (provider) openBenchmarkModal({ modelId: model.id, provider });
                              }}
                            />
                          }
                        >
                          <ModelRatingRadar dimensions={ratingDimensions} />
                        </TooltipTrigger>
                        <TooltipContent>
                          {t('ModelSwitchPanel.detail.rating.clickHint')}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <Flexbox gap={4}>
                        {ratedDimensions.map((dimension) => (
                          <Flexbox
                            horizontal
                            align={'center'}
                            className={styles.row}
                            justify={'space-between'}
                            key={dimension.key}
                          >
                            <span>{dimension.label}</span>
                            <Tooltip>
                              <TooltipTrigger
                                render={
                                  dimension.sourceUrl ? (
                                    <a
                                      className={styles.ratingScoreLink}
                                      href={dimension.sourceUrl}
                                      rel={'noreferrer'}
                                      target={'_blank'}
                                    />
                                  ) : (
                                    <span className={styles.ratingScoreLink} />
                                  )
                                }
                              >
                                {dimension.score}
                              </TooltipTrigger>
                              <TooltipContent>{dimension.tooltip}</TooltipContent>
                            </Tooltip>
                          </Flexbox>
                        ))}
                      </Flexbox>
                    )}
                  </Flexbox>
                </AccordionPanel>
              </AccordionItem>
            )}

            {/* Context Length */}
            {contextWindowLabel && (
              <AccordionItem disabled value="context">
                <AccordionHeader style={{ paddingBlock: 6, paddingInline: 8 }}>
                  <Flexbox horizontal align={'center'} flex={1} gap={8}>
                    <div className="h-3.5 w-px shrink-0 rounded-full bg-border" />
                    <span className={styles.titleText}>{t('ModelSwitchPanel.detail.context')}</span>
                  </Flexbox>
                  <span className={styles.actionText}>{contextWindowLabel}</span>
                </AccordionHeader>
              </AccordionItem>
            )}

            {/* Abilities */}
            {hasAbilities && (
              <AccordionItem value="abilities">
                <AccordionHeader>
                  <AccordionTrigger style={{ paddingBlock: 6, paddingInline: 8 }}>
                    <Flexbox horizontal align={'center'} gap={8}>
                      <div className="h-3.5 w-px shrink-0 rounded-full bg-border" />
                      <span className={styles.titleText}>
                        {t('ModelSwitchPanel.detail.abilities')}
                      </span>
                    </Flexbox>
                  </AccordionTrigger>
                  {!isAbilitiesExpanded && (
                    <Flexbox horizontal gap={2}>
                      {enabledAbilities.map((ability) => (
                        <Badge
                          className="min-w-0 px-1"
                          key={ability.key}
                          variant={ABILITY_BADGE_VARIANTS[ability.color] ?? 'secondary'}
                        >
                          <Icon icon={ability.icon} style={{ fontSize: 12 }} />
                        </Badge>
                      ))}
                    </Flexbox>
                  )}
                </AccordionHeader>
                <AccordionPanel>
                  <Flexbox gap={4}>
                    {enabledAbilities.map((ability) => (
                      <Flexbox
                        horizontal
                        align={'center'}
                        className={styles.row}
                        justify={'space-between'}
                        key={ability.key}
                      >
                        <Flexbox horizontal align={'center'} gap={6}>
                          <Icon icon={ability.icon} style={{ fontSize: 12 }} />
                          <span>
                            {t(`ModelSwitchPanel.detail.abilities.${ability.key}` as any)}
                          </span>
                        </Flexbox>
                        <span className="text-xs leading-5 text-muted-foreground">
                          {t(
                            `ModelSelect.featureTag.${ability.key === 'files' ? 'file' : ability.key}` as any,
                          )}
                        </span>
                      </Flexbox>
                    ))}
                  </Flexbox>
                </AccordionPanel>
              </AccordionItem>
            )}

            {/* Pricing */}
            {hasPricing && (formatPrice || approximatePriceLabel) && (
              <AccordionItem value="pricing">
                <AccordionHeader>
                  <AccordionTrigger style={{ paddingBlock: 6, paddingInline: 8 }}>
                    <Flexbox horizontal align={'center'} gap={8}>
                      <div className="h-3.5 w-px shrink-0 rounded-full bg-border" />
                      <span className={styles.titleText}>
                        {t('ModelSwitchPanel.detail.pricing')}
                      </span>
                    </Flexbox>
                  </AccordionTrigger>
                  {!isPricingExpanded &&
                    (approximatePriceLabel ? (
                      <span className={styles.actionText}>{approximatePriceLabel}</span>
                    ) : (
                      <Flexbox horizontal align={'center'} className={styles.actionText} gap={8}>
                        {hasCachedInputPricing && (
                          <Tooltip>
                            <TooltipTrigger render={<span className="flex items-center gap-0.5" />}>
                              <Icon icon={CircleFadingArrowUp} size={'small'} />
                              <PriceValue price={formatPrice!.cachedInput} />
                            </TooltipTrigger>
                            <TooltipContent>
                              {getPricingTooltip('cachedInput', formatPrice!.cachedInput.current)}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger render={<span className="flex items-center gap-0.5" />}>
                            <Icon icon={ArrowUpFromDot} size={'small'} />
                            <PriceValue price={formatPrice!.input} />
                          </TooltipTrigger>
                          <TooltipContent>
                            {getPricingTooltip('input', formatPrice!.input.current)}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger render={<span className="flex items-center gap-0.5" />}>
                            <Icon icon={ArrowDownToDot} size={'small'} />
                            <PriceValue price={formatPrice!.output} />
                          </TooltipTrigger>
                          <TooltipContent>
                            {getPricingTooltip('output', formatPrice!.output.current)}
                          </TooltipContent>
                        </Tooltip>
                      </Flexbox>
                    ))}
                </AccordionHeader>
                <AccordionPanel>
                  <Flexbox gap={8}>
                    {approximatePriceLabel && (
                      <Flexbox className={`${styles.row} font-medium`}>
                        {approximatePriceLabel}
                      </Flexbox>
                    )}
                    {pricingGroups.map(({ group, units }) => (
                      <Flexbox gap={4} key={group}>
                        {pricingGroups.length > 1 && (
                          <Flexbox className={`${styles.row} font-medium`}>
                            {t(`ModelSwitchPanel.detail.pricing.group.${group}` as any)}
                          </Flexbox>
                        )}
                        {units.map((unit) => (
                          <Flexbox
                            horizontal
                            align={'center'}
                            className={styles.row}
                            justify={'space-between'}
                            key={unit.name}
                          >
                            <Flexbox horizontal align={'center'} gap={6}>
                              {UNIT_ICON_MAP[unit.name] && (
                                <Icon icon={UNIT_ICON_MAP[unit.name]!} size={'small'} />
                              )}
                              <span>
                                {t(`ModelSwitchPanel.detail.pricing.unit.${unit.name}` as any)}
                              </span>
                            </Flexbox>
                            <PriceValue
                              prefix={isCreditPricing ? '' : '$'}
                              price={formatUnitPrice(unit)}
                              suffix={getUnitPriceSuffix(unit.unit)}
                            />
                          </Flexbox>
                        ))}
                      </Flexbox>
                    ))}
                  </Flexbox>
                </AccordionPanel>
              </AccordionItem>
            )}
          </AccordionRoot>
        )}
      </Flexbox>
    );
  },
);

ModelDetailPanel.displayName = 'ModelDetailPanel';

export default ModelDetailPanel;
