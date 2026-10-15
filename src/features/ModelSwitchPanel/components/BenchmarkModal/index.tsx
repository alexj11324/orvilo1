import { Flexbox, Icon } from '@lobehub/ui';
import { t } from 'i18next';
import { ChevronDownIcon, ChevronUpIcon, InfoIcon, PlusIcon, XIcon } from 'lucide-react';
import type { ModelRating } from 'model-bank';
import type { FC } from 'react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBusinessModelRating } from '@/business/client/hooks/useBusinessModelRating';
import { DropdownMenu } from '@/components/ItemsMenu';
import { createModal } from '@/components/Modal';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useEnabledChatModels } from '@/hooks/useEnabledChatModels';

import type { RatingDimensionKey } from '../ModelRatingRadar';
import { RATING_DIMENSION_ORDER, RATING_SOURCE_NAMES } from '../ModelRatingRadar';
import type { CompareRadarSeries } from './CompareRadar';
import CompareRadar, { COMPARE_SERIES_COLORS, MAX_COMPARE_MODELS } from './CompareRadar';

const RULE_KEYS = ['relative', 'sources', 'speed', 'price', 'missing'] as const;

const styles = {
  addButton:
    'cursor-pointer gap-1 border-dashed border-border bg-transparent px-2 text-sm leading-5.5 font-normal text-muted-foreground hover:border-primary-text hover:bg-transparent hover:text-primary-text active:not-aria-[haspopup]:translate-y-0',
  addButtonDisabled:
    'disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground',
  bestPill: 'inline-block rounded-(--radius-chip) px-2 py-px font-semibold',
  cell: 'text-xs leading-5 text-foreground text-center',
  cellMissing: 'text-muted-foreground',
  chip: 'inline-flex max-w-50 items-center gap-1.5 rounded-(--radius-chip) border border-divider px-2 py-0.5 text-sm leading-5.5 text-foreground',
  chipName: 'min-w-0 truncate',
  chipRemove:
    'cursor-pointer text-muted-foreground hover:text-foreground active:not-aria-[haspopup]:translate-y-0',
  colorDot: 'size-2 shrink-0 rounded-full',
  headerCell:
    'inline-flex items-center justify-center gap-1.5 overflow-hidden text-sm leading-5.5 font-medium text-muted-foreground',
  headerName: 'min-w-0 truncate',
  ruleItem: 'text-sm leading-5.5 text-muted-foreground',
  rulesList: 'm-0 ps-4',
  rulesToggle:
    'cursor-pointer self-start gap-1 border-0 bg-transparent px-2 text-sm leading-5.5 font-normal text-muted-foreground hover:bg-transparent hover:text-foreground active:not-aria-[haspopup]:translate-y-0',
  sourceLink: 'text-muted-foreground hover:text-primary-text',
  table: 'grid gap-y-1',
  tableDivider: 'col-span-full border-t border-divider',
  tableHeader: 'text-sm leading-5.5 font-medium text-muted-foreground text-center',
  tableRowLabel: 'text-sm leading-5.5 text-muted-foreground text-start',
};

interface RatedModel {
  displayName: string;
  id: string;
  rating: ModelRating;
}

interface SelectedSeries extends RatedModel {
  color: string;
}

const dimensionLabel = (key: RatingDimensionKey) =>
  String(t(`ModelSwitchPanel.detail.rating.dimension.${key}`, { ns: 'components' }));

interface ScoreCellProps {
  best: boolean;
  /** the model's series color — the best-in-row pill is tinted with it */
  color: string;
  score: NonNullable<ModelRating[RatingDimensionKey]> | undefined;
}

const ScoreCell: FC<ScoreCellProps> = ({ best, color, score }) => {
  if (!score) return <span className={`${styles.cell} ${styles.cellMissing}`}>-</span>;

  const tooltip = [
    RATING_SOURCE_NAMES[score.source],
    score.raw === undefined ? undefined : String(score.raw),
    score.updatedAt,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Tooltip>
      <TooltipTrigger render={<span className={styles.cell} />}>
        {best ? (
          // series color + '26' alpha suffix ≈ 15% tint background
          <span className={styles.bestPill} style={{ background: `${color}26`, color }}>
            {score.score}
          </span>
        ) : (
          score.score
        )}
      </TooltipTrigger>
      <TooltipContent>{tooltip}</TooltipContent>
    </Tooltip>
  );
};

interface BenchmarkModalContentProps {
  modelId: string;
  provider: string;
}

const BenchmarkModalContent: FC<BenchmarkModalContentProps> = memo(({ modelId, provider }) => {
  const { t } = useTranslation('components');
  const enabledList = useEnabledChatModels();
  const applyRating = useBusinessModelRating();
  const [selectedIds, setSelectedIds] = useState<string[]>([modelId]);
  // rules are low-frequency reference content — collapsed by default so the
  // radar and score table keep the modal's vertical space
  const [rulesOpen, setRulesOpen] = useState(false);

  // all rated models of the same provider — the compare candidate pool
  const ratedModels = useMemo<RatedModel[]>(() => {
    const providerData = enabledList.find((item) => item.id === provider);

    return (providerData?.children ?? []).flatMap((model) => {
      const rating = applyRating({ model: model.id, provider });
      if (!rating || Object.keys(rating).length === 0) return [];

      return [{ displayName: model.displayName || model.id, id: model.id, rating }];
    });
  }, [applyRating, enabledList, provider]);

  const selected = useMemo<SelectedSeries[]>(
    () =>
      selectedIds.flatMap((id, index) => {
        const model = ratedModels.find((item) => item.id === id);

        return model ? [{ ...model, color: COMPARE_SERIES_COLORS[index] }] : [];
      }),
    [ratedModels, selectedIds],
  );

  const candidates = useMemo(
    () => ratedModels.filter((model) => !selectedIds.includes(model.id)),
    [ratedModels, selectedIds],
  );

  const dimensions = RATING_DIMENSION_ORDER.map((key) => ({ key, label: dimensionLabel(key) }));

  const series: CompareRadarSeries[] = selected.map((model) => ({
    color: model.color,
    id: model.id,
    name: model.displayName,
    scores: RATING_DIMENSION_ORDER.map((key) => model.rating[key]?.score),
  }));

  const isCompare = selected.length > 1;
  const atLimit = selectedIds.length >= MAX_COMPARE_MODELS;
  const canAdd = candidates.length > 0 && !atLimit;

  const addButton = (
    <Button
      className={canAdd ? styles.addButton : `${styles.addButton} ${styles.addButtonDisabled}`}
      disabled={!canAdd}
      size="normal"
      type={'button'}
      variant="ghost"
    >
      <Icon className="size-4" icon={PlusIcon} size={16} />
      {t('ModelSwitchPanel.detail.rating.modal.compare.add')}
    </Button>
  );

  return (
    <Flexbox gap={16} paddingBlock={'0 8px'}>
      {/* selected model chips + compare picker */}
      <Flexbox horizontal align={'center'} gap={8} style={{ flexWrap: 'wrap' }}>
        {selected.map((model) => (
          <span className={styles.chip} key={model.id}>
            <span className={styles.colorDot} style={{ background: model.color }} />
            <span className={styles.chipName}>{model.displayName}</span>
            {selected.length > 1 && (
              <Button
                aria-label={t('remove', { ns: 'common' })}
                className={styles.chipRemove}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => setSelectedIds((prev) => prev.filter((id) => id !== model.id))}
              >
                <Icon className="size-4" icon={XIcon} size={16} />
              </Button>
            )}
          </span>
        ))}
        {candidates.length > 0 &&
          (canAdd ? (
            <DropdownMenu
              items={candidates.map((model) => ({
                key: model.id,
                label: model.displayName,
                onClick: () => setSelectedIds((prev) => [...prev, model.id]),
              }))}
            >
              {addButton}
            </DropdownMenu>
          ) : (
            <Tooltip>
              {/* The disabled button swallows pointer events, so a wrapper hosts the hint. */}
              <TooltipTrigger render={<span className="inline-flex" />}>{addButton}</TooltipTrigger>
              <TooltipContent>
                {t('ModelSwitchPanel.detail.rating.modal.compare.limit', {
                  count: MAX_COMPARE_MODELS,
                })}
              </TooltipContent>
            </Tooltip>
          ))}
      </Flexbox>

      <CompareRadar dimensions={dimensions} series={series} />

      {/* score details: single model = source breakdown, compare = score matrix */}
      {isCompare ? (
        <div
          className={styles.table}
          style={{ gridTemplateColumns: `88px repeat(${selected.length}, 1fr)` }}
        >
          <span className={`${styles.tableHeader} ${styles.tableRowLabel}`}>
            {t('ModelSwitchPanel.detail.rating.modal.table.dimension')}
          </span>
          {selected.map((model) => (
            <span className={styles.headerCell} key={model.id}>
              <span className={styles.colorDot} style={{ background: model.color }} />
              <span className={styles.headerName}>{model.displayName}</span>
            </span>
          ))}
          <div className={styles.tableDivider} />
          {RATING_DIMENSION_ORDER.flatMap((key, dimensionIndex) => {
            const scores = selected.map((model) => model.rating[key]?.score);
            const bestScore = Math.max(...scores.map((score) => score ?? -1));

            return [
              <span className={styles.tableRowLabel} key={`${key}-label`}>
                {dimensions[dimensionIndex].label}
              </span>,
              ...selected.map((model) => (
                <ScoreCell
                  best={model.rating[key]?.score === bestScore && bestScore >= 0}
                  color={model.color}
                  key={`${key}-${model.id}`}
                  score={model.rating[key]}
                />
              )),
            ];
          })}
        </div>
      ) : (
        selected[0] && (
          <div className={`${styles.table} grid-cols-[88px_1fr_1fr_1.4fr_1fr]`}>
            {(['dimension', 'score', 'raw', 'source', 'updatedAt'] as const).map((column) => (
              <span
                key={column}
                className={
                  column === 'dimension'
                    ? `${styles.tableHeader} ${styles.tableRowLabel}`
                    : styles.tableHeader
                }
              >
                {t(`ModelSwitchPanel.detail.rating.modal.table.${column}`)}
              </span>
            ))}
            <div className={styles.tableDivider} />
            {RATING_DIMENSION_ORDER.flatMap((key, dimensionIndex) => {
              const score = selected[0].rating[key];

              if (!score)
                return [
                  <span
                    className={`${styles.tableRowLabel} ${styles.cellMissing}`}
                    key={`${key}-label`}
                  >
                    {dimensions[dimensionIndex].label}
                  </span>,
                  ...Array.from({ length: 4 }, (_, i) => (
                    <span className={`${styles.cell} ${styles.cellMissing}`} key={`${key}-${i}`}>
                      -
                    </span>
                  )),
                ];

              return [
                <span className={styles.tableRowLabel} key={`${key}-label`}>
                  {dimensions[dimensionIndex].label}
                </span>,
                <span className={`${styles.cell} font-semibold`} key={`${key}-score`}>
                  {score.score}
                </span>,
                <span className={styles.cell} key={`${key}-raw`}>
                  {score.raw ?? '-'}
                </span>,
                <span className={styles.cell} key={`${key}-source`}>
                  <a
                    className={styles.sourceLink}
                    href={score.sourceUrl}
                    rel={'noreferrer'}
                    target={'_blank'}
                  >
                    {RATING_SOURCE_NAMES[score.source]}
                  </a>
                </span>,
                <span className={styles.cell} key={`${key}-updated`}>
                  {score.updatedAt}
                </span>,
              ];
            })}
          </div>
        )
      )}

      {/* scoring rules & caveats — collapsed footer entry */}
      <Flexbox gap={8}>
        <Button
          className={styles.rulesToggle}
          size="normal"
          type={'button'}
          variant="ghost"
          onClick={() => setRulesOpen((prev) => !prev)}
        >
          <Icon className="size-4" icon={InfoIcon} size={16} />
          {t('ModelSwitchPanel.detail.rating.modal.rules.title')}
          <Icon className="size-4" icon={rulesOpen ? ChevronUpIcon : ChevronDownIcon} size={16} />
        </Button>
        {rulesOpen && (
          <ul className={styles.rulesList}>
            {RULE_KEYS.map((key) => (
              <li className={styles.ruleItem} key={key}>
                {t(`ModelSwitchPanel.detail.rating.modal.rules.${key}`)}
              </li>
            ))}
          </ul>
        )}
      </Flexbox>
    </Flexbox>
  );
});

BenchmarkModalContent.displayName = 'BenchmarkModalContent';

export const openBenchmarkModal = (props: BenchmarkModalContentProps) =>
  createModal({
    content: <BenchmarkModalContent {...props} />,
    footer: null,
    maskClosable: true,
    title: t('ModelSwitchPanel.detail.rating.modal.title', { ns: 'components' }),
    width: 560,
  });

export default BenchmarkModalContent;
