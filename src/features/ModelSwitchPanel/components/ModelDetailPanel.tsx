import { cn } from 'cn';
import { ArrowDownToDot, ArrowUpFromDot, CircleFadingArrowUp, Play } from 'lucide-react';
import type { CSSProperties, FC, ReactNode } from 'react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Badge, type BadgeProps } from '@/components/reui/badge';
import {
  Accordion,
  AccordionContent,
  AccordionHeader,
  AccordionHeaderTrigger,
  AccordionItem,
} from '@/components/ui/accordion';
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

// Borderless sections with an inline disclosure triangle: the header row
// washes on hover and the panel content sits flush under it.
const sectionStyles = {
  content: 'pbe-0 [&_a]:hover:text-primary-text',
  header:
    'relative rounded-(--radius-button) transition-[background-color] duration-150 motion-reduce:transition-none [&:hover:not(:has([data-disabled]))]:bg-accent',
  indicator:
    'flex size-4.5 shrink-0 items-center justify-center -ms-1.5 text-foreground-description transition-transform duration-200 motion-reduce:transition-none group-data-panel-open/accordion-trigger:rotate-90',
  item: 'flex flex-col not-last:border-be-0',
  trigger:
    'flex min-w-0 flex-1 cursor-pointer select-none items-center gap-2 rounded-[inherit] border-0 bg-transparent px-2 py-2 text-start text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50 data-disabled:cursor-not-allowed data-disabled:text-foreground-quaternary',
};

const SECTION_TRIGGER_STYLE: CSSProperties = { paddingBlock: 6, paddingInline: 8 };

const SectionTrigger = ({ children }: { children: ReactNode }) => (
  <AccordionHeaderTrigger className={sectionStyles.trigger} style={SECTION_TRIGGER_STYLE}>
    {children}
    <span className={sectionStyles.indicator}>
      <Play fill="currentColor" size={7} strokeWidth={1} />
    </span>
  </AccordionHeaderTrigger>
);

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
      <div className={cn('flex flex-col', styles.container)}>
        {description && (
          <p className={cn('text-sm leading-5.5 text-foreground-description', styles.description)}>
            {description}
          </p>
        )}
        {/* Sections */}
        {(hasRating || hasPricing || contextWindowLabel || hasAbilities) && (
          <Accordion
            multiple
            className="gap-2"
            value={expandedKeys}
            onValueChange={handleExpandedChange}
          >
            {/* Benchmarks */}
            {hasRating && (
              <AccordionItem className={sectionStyles.item} value="rating">
                <AccordionHeader className={sectionStyles.header}>
                  <SectionTrigger>
                    <div className="flex flex-row items-center gap-2">
                      <div className="h-3.5 w-px shrink-0 rounded-full bg-border" />
                      <span className={styles.titleText}>
                        {t('ModelSwitchPanel.detail.rating')}
                      </span>
                    </div>
                  </SectionTrigger>
                </AccordionHeader>
                <AccordionContent className={sectionStyles.content}>
                  <div className="flex flex-col gap-1">
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
                      <div className="flex flex-col gap-1">
                        {ratedDimensions.map((dimension) => (
                          <div
                            className={cn('flex items-center justify-between w-full', styles.row)}
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
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Context Length */}
            {contextWindowLabel && (
              <AccordionItem disabled className={sectionStyles.item} value="context">
                <AccordionHeader className={sectionStyles.header} style={SECTION_TRIGGER_STYLE}>
                  <div className="flex flex-1 flex-row items-center gap-2">
                    <div className="h-3.5 w-px shrink-0 rounded-full bg-border" />
                    <span className={styles.titleText}>{t('ModelSwitchPanel.detail.context')}</span>
                  </div>
                  <span className={styles.actionText}>{contextWindowLabel}</span>
                </AccordionHeader>
              </AccordionItem>
            )}

            {/* Abilities */}
            {hasAbilities && (
              <AccordionItem className={sectionStyles.item} value="abilities">
                <AccordionHeader className={sectionStyles.header}>
                  <SectionTrigger>
                    <div className="flex flex-row items-center gap-2">
                      <div className="h-3.5 w-px shrink-0 rounded-full bg-border" />
                      <span className={styles.titleText}>
                        {t('ModelSwitchPanel.detail.abilities')}
                      </span>
                    </div>
                  </SectionTrigger>
                  {!isAbilitiesExpanded && (
                    <div className="flex gap-0.5">
                      {enabledAbilities.map((ability) => (
                        <Badge
                          className="min-w-0 px-1"
                          key={ability.key}
                          variant={ABILITY_BADGE_VARIANTS[ability.color] ?? 'secondary'}
                        >
                          <ability.icon size={12} />
                        </Badge>
                      ))}
                    </div>
                  )}
                </AccordionHeader>
                <AccordionContent className={sectionStyles.content}>
                  <div className="flex flex-col gap-1">
                    {enabledAbilities.map((ability) => (
                      <div
                        className={cn('flex items-center justify-between w-full', styles.row)}
                        key={ability.key}
                      >
                        <div className="flex items-center gap-1.5">
                          <ability.icon size={12} />
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
                </AccordionContent>
              </AccordionItem>
            )}

            {/* Pricing */}
            {hasPricing && (formatPrice || approximatePriceLabel) && (
              <AccordionItem className={sectionStyles.item} value="pricing">
                <AccordionHeader className={sectionStyles.header}>
                  <SectionTrigger>
                    <div className="flex flex-row items-center gap-2">
                      <div className="h-3.5 w-px shrink-0 rounded-full bg-border" />
                      <span className={styles.titleText}>
                        {t('ModelSwitchPanel.detail.pricing')}
                      </span>
                    </div>
                  </SectionTrigger>
                  {!isPricingExpanded &&
                    (approximatePriceLabel ? (
                      <span className={styles.actionText}>{approximatePriceLabel}</span>
                    ) : (
                      <div className={cn('flex items-center gap-2', styles.actionText)}>
                        {hasCachedInputPricing && (
                          <Tooltip>
                            <TooltipTrigger render={<span className="flex items-center gap-0.5" />}>
                              <CircleFadingArrowUp size={14} />
                              <PriceValue price={formatPrice!.cachedInput} />
                            </TooltipTrigger>
                            <TooltipContent>
                              {getPricingTooltip('cachedInput', formatPrice!.cachedInput.current)}
                            </TooltipContent>
                          </Tooltip>
                        )}
                        <Tooltip>
                          <TooltipTrigger render={<span className="flex items-center gap-0.5" />}>
                            <ArrowUpFromDot size={14} />
                            <PriceValue price={formatPrice!.input} />
                          </TooltipTrigger>
                          <TooltipContent>
                            {getPricingTooltip('input', formatPrice!.input.current)}
                          </TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger render={<span className="flex items-center gap-0.5" />}>
                            <ArrowDownToDot size={14} />
                            <PriceValue price={formatPrice!.output} />
                          </TooltipTrigger>
                          <TooltipContent>
                            {getPricingTooltip('output', formatPrice!.output.current)}
                          </TooltipContent>
                        </Tooltip>
                      </div>
                    ))}
                </AccordionHeader>
                <AccordionContent className={sectionStyles.content}>
                  <div className="flex flex-col gap-2">
                    {approximatePriceLabel && (
                      <div className={cn('flex flex-col font-medium', styles.row)}>
                        {approximatePriceLabel}
                      </div>
                    )}
                    {pricingGroups.map(({ group, units }) => (
                      <div className="flex flex-col gap-1" key={group}>
                        {pricingGroups.length > 1 && (
                          <div className={cn('flex flex-col font-medium', styles.row)}>
                            {t(`ModelSwitchPanel.detail.pricing.group.${group}` as any)}
                          </div>
                        )}
                        {units.map((unit) => {
                          const UnitIcon = UNIT_ICON_MAP[unit.name];
                          return (
                            <div
                              className={cn('flex items-center justify-between w-full', styles.row)}
                              key={unit.name}
                            >
                              <div className="flex items-center gap-1.5">
                                {UnitIcon && <UnitIcon size={14} />}
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
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            )}
          </Accordion>
        )}
      </div>
    );
  },
);

ModelDetailPanel.displayName = 'ModelDetailPanel';

export default ModelDetailPanel;
