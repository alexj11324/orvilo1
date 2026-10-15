import { ArrowDownToDot, ArrowUpFromDot, CircleFadingArrowUp, type LucideIcon } from 'lucide-react';
import type { FC } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge } from '@/components/reui/badge';
import {
  Accordion as AccordionRoot,
  AccordionContent as AccordionPanel,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SimpleTooltip as Tooltip } from '@/components/ui/tooltip';
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

const styles = {
  actionText: 'text-sm leading-5.5 font-medium text-foreground',
  container: 'pb-2',
  description: 'm-0 px-2 py-2 wrap-anywhere whitespace-pre-wrap',
  radarClickable:
    'cursor-pointer rounded-(--radius-card) transition-[background] duration-(--orvilo-motion-mid) ease-(--ant-motion-ease-in-out) hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 motion-reduce:transition-none',
  ratingScoreLink:
    'inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary-text',
  row: 'px-2 py-1 text-sm leading-5.5 text-muted-foreground',
  originalPriceText: 'text-muted-foreground line-through',
  priceValue: 'inline-flex items-baseline gap-1',
  titleText: 'text-sm leading-5.5 font-normal text-muted-foreground',
};

function DetailIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon aria-hidden className="size-3 shrink-0" />;
}

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
      <div className={`flex min-w-0 flex-col ${styles.container}`}>
        {description && (
          <p className={`${styles.description} text-sm text-muted-foreground`}>{description}</p>
        )}
        {/* Sections */}
        {(hasRating || hasPricing || contextWindowLabel || hasAbilities) && (
          <AccordionRoot
            multiple
            className="gap-2"
            value={expandedKeys}
            onValueChange={handleExpandedChange}
          >
            {/* Benchmarks */}
            {hasRating && (
              <AccordionItem value="rating">
                <div className="flex min-w-0 items-center justify-between [&>h3]:flex-1">
                  <AccordionTrigger className="px-2 py-1.5">
                    <div className="flex min-w-0 flex-row items-center gap-2">
                      <div className="h-3.5 w-px shrink-0 rounded-full bg-border" />
                      <span className={styles.titleText}>
                        {t('ModelSwitchPanel.detail.rating')}
                      </span>
                    </div>
                  </AccordionTrigger>
                </div>
                <AccordionPanel>
                  <div className="flex min-w-0 flex-col gap-1">
                    {ratedDimensions.length >= RADAR_MIN_DIMENSIONS ? (
                      <Tooltip title={t('ModelSwitchPanel.detail.rating.clickHint')}>
                        <div
                          className={styles.radarClickable}
                          role={'button'}
                          tabIndex={0}
                          onClick={() => {
                            if (provider) openBenchmarkModal({ modelId: model.id, provider });
                          }}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              if (provider) openBenchmarkModal({ modelId: model.id, provider });
                            }
                          }}
                        >
                          <ModelRatingRadar dimensions={ratingDimensions} />
                        </div>
                      </Tooltip>
                    ) : (
                      <div className="flex min-w-0 flex-col gap-1">
                        {ratedDimensions.map((dimension) => (
                          <div
                            className={`flex min-w-0 flex-row items-center justify-between ${styles.row}`}
                            key={dimension.key}
                          >
                            <span>{dimension.label}</span>
                            <Tooltip title={dimension.tooltip}>
                              {dimension.sourceUrl ? (
                                <a
                                  className={styles.ratingScoreLink}
                                  href={dimension.sourceUrl}
                                  rel={'noreferrer'}
                                  target={'_blank'}
                                >
                                  {dimension.score}
                                </a>
                              ) : (
                                <span className={styles.ratingScoreLink}>{dimension.score}</span>
                              )}
                            </Tooltip>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </AccordionPanel>
              </AccordionItem>
            )}

            {/* Context Length */}
            {contextWindowLabel && (
              <AccordionItem disabled value="context">
                <div className="flex min-w-0 items-center justify-between px-2 py-1.5">
                  <div className="flex min-w-0 flex-row items-center gap-2 flex-1">
                    <div className="h-3.5 w-px shrink-0 rounded-full bg-border" />
                    <span className={styles.titleText}>{t('ModelSwitchPanel.detail.context')}</span>
                  </div>
                  <span className={styles.actionText}>{contextWindowLabel}</span>
                </div>
              </AccordionItem>
            )}

            {/* Abilities */}
            {hasAbilities && (
              <AccordionItem value="abilities">
                <div className="flex min-w-0 items-center justify-between [&>h3]:flex-1">
                  <AccordionTrigger className="px-2 py-1.5">
                    <div className="flex min-w-0 flex-row items-center gap-2">
                      <div className="h-3.5 w-px shrink-0 rounded-full bg-border" />
                      <span className={styles.titleText}>
                        {t('ModelSwitchPanel.detail.abilities')}
                      </span>
                    </div>
                  </AccordionTrigger>
                  {!isAbilitiesExpanded && (
                    <div className="flex min-w-0 flex-row gap-0.5">
                      {enabledAbilities.map((ability) => (
                        <Badge
                          className="min-w-0 px-1 py-0"
                          key={ability.key}
                          role="img"
                          size="xs"
                          variant="secondary"
                          aria-label={String(
                            t(`ModelSwitchPanel.detail.abilities.${ability.key}` as any),
                          )}
                        >
                          <DetailIcon icon={ability.icon} />
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <AccordionPanel>
                  <div className="flex min-w-0 flex-col gap-1">
                    {enabledAbilities.map((ability) => (
                      <div
                        className={`flex min-w-0 flex-row items-center justify-between ${styles.row}`}
                        key={ability.key}
                      >
                        <div className="flex min-w-0 flex-row items-center gap-1.5">
                          <DetailIcon icon={ability.icon} />
                          <span>
                            {t(`ModelSwitchPanel.detail.abilities.${ability.key}` as any)}
                          </span>
                        </div>
                        <span className="text-xs leading-5 text-muted-foreground">
                          {t(
                            `ModelSelect.featureTag.${ability.key === 'files' ? 'file' : ability.key}` as any,
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </AccordionPanel>
              </AccordionItem>
            )}

            {/* Pricing */}
            {hasPricing && (formatPrice || approximatePriceLabel) && (
              <AccordionItem value="pricing">
                <div className="flex min-w-0 items-center justify-between [&>h3]:flex-1">
                  <AccordionTrigger className="px-2 py-1.5">
                    <div className="flex min-w-0 flex-row items-center gap-2">
                      <div className="h-3.5 w-px shrink-0 rounded-full bg-border" />
                      <span className={styles.titleText}>
                        {t('ModelSwitchPanel.detail.pricing')}
                      </span>
                    </div>
                  </AccordionTrigger>
                  {!isPricingExpanded &&
                    (approximatePriceLabel ? (
                      <span className={styles.actionText}>{approximatePriceLabel}</span>
                    ) : (
                      <div
                        className={`flex min-w-0 flex-row items-center gap-2 ${styles.actionText}`}
                      >
                        {hasCachedInputPricing && (
                          <Tooltip
                            title={getPricingTooltip(
                              'cachedInput',
                              formatPrice!.cachedInput.current,
                            )}
                          >
                            <div className="flex min-w-0 flex-row items-center gap-0.5">
                              <DetailIcon icon={CircleFadingArrowUp} />
                              <PriceValue price={formatPrice!.cachedInput} />
                            </div>
                          </Tooltip>
                        )}
                        <Tooltip title={getPricingTooltip('input', formatPrice!.input.current)}>
                          <div className="flex min-w-0 flex-row items-center gap-0.5">
                            <DetailIcon icon={ArrowUpFromDot} />
                            <PriceValue price={formatPrice!.input} />
                          </div>
                        </Tooltip>
                        <Tooltip title={getPricingTooltip('output', formatPrice!.output.current)}>
                          <div className="flex min-w-0 flex-row items-center gap-0.5">
                            <DetailIcon icon={ArrowDownToDot} />
                            <PriceValue price={formatPrice!.output} />
                          </div>
                        </Tooltip>
                      </div>
                    ))}
                </div>
                <AccordionPanel>
                  <div className="flex min-w-0 flex-col gap-2">
                    {approximatePriceLabel && (
                      <div className={`flex min-w-0 flex-col ${`${styles.row}`} font-medium`}>
                        {approximatePriceLabel}
                      </div>
                    )}
                    {pricingGroups.map(({ group, units }) => (
                      <div className="flex min-w-0 flex-col gap-1" key={group}>
                        {pricingGroups.length > 1 && (
                          <div className={`flex min-w-0 flex-col ${`${styles.row}`} font-medium`}>
                            {t(`ModelSwitchPanel.detail.pricing.group.${group}` as any)}
                          </div>
                        )}
                        {units.map((unit) => (
                          <div
                            className={`flex min-w-0 flex-row items-center justify-between ${styles.row}`}
                            key={unit.name}
                          >
                            <div className="flex min-w-0 flex-row items-center gap-1.5">
                              {UNIT_ICON_MAP[unit.name] && (
                                <DetailIcon icon={UNIT_ICON_MAP[unit.name]!} />
                              )}
                              <span>
                                {t(`ModelSwitchPanel.detail.pricing.unit.${unit.name}` as any)}
                              </span>
                            </div>
                            <PriceValue
                              prefix={isCreditPricing ? '' : '$'}
                              price={formatUnitPrice(unit)}
                              suffix={getUnitPriceSuffix(unit.unit)}
                            />
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </AccordionPanel>
              </AccordionItem>
            )}
          </AccordionRoot>
        )}
      </div>
    );
  },
);

ModelDetailPanel.displayName = 'ModelDetailPanel';

export default ModelDetailPanel;
