import { Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { createModal, DropdownMenu } from '@lobehub/ui/base-ui';
import { t } from 'i18next';
import { ChevronDownIcon, ChevronUpIcon, InfoIcon, PlusIcon, XIcon } from 'lucide-react';
import type { ModelRating } from 'model-bank';
import type { FC } from 'react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useBusinessModelRating } from '@/business/client/hooks/useBusinessModelRating';
import { useEnabledChatModels } from '@/hooks/useEnabledChatModels';

import type { RatingDimensionKey } from '../ModelRatingRadar';
import { RATING_DIMENSION_ORDER, RATING_SOURCE_NAMES } from '../ModelRatingRadar';
import type { CompareRadarSeries } from './CompareRadar';
import CompareRadar, { COMPARE_SERIES_COLORS, MAX_COMPARE_MODELS } from './CompareRadar';

const RULE_KEYS = ['relative', 'sources', 'speed', 'price', 'missing'] as const;

const styles = {
  addButton:
    'inline-flex min-h-9 cursor-pointer items-center gap-1 rounded-(--radius-button) border border-dashed border-border px-2 py-1 text-sm leading-5.5 text-muted-foreground hover:border-primary-text hover:text-primary-text focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
  addButtonDisabled:
    'disabled:cursor-not-allowed disabled:border-border disabled:text-muted-foreground',
  bestPill: 'inline-block rounded-(--radius-chip) px-2 py-px font-semibold',
  cell: 'text-xs leading-5 text-foreground text-center',
  cellMissing: 'text-muted-foreground',
  chip: 'inline-flex max-w-50 items-center gap-1.5 rounded-(--radius-chip) border border-divider px-2 py-0.5 text-sm leading-5.5 text-foreground',
  chipName: 'min-w-0 truncate',
  chipRemove:
    'inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-(--radius-input) text-muted-foreground hover:text-foreground hover:bg-accent',
  colorDot: 'size-2 shrink-0 rounded-full',
  headerCell:
    'inline-flex items-center justify-center gap-1.5 overflow-hidden text-sm leading-5.5 font-medium text-muted-foreground',
  headerName: 'min-w-0 truncate',
  ruleItem: 'text-sm leading-5.5 text-muted-foreground',
  rulesList: 'm-0 ps-4',
  rulesToggle:
    'inline-flex min-h-9 cursor-pointer items-center self-start gap-1 rounded-(--radius-button) border-0 bg-transparent px-2 py-1 text-sm leading-5.5 text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
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
    <Tooltip title={tooltip}>
      <span className={styles.cell}>
        {best ? (
          // series color + '26' alpha suffix ≈ 15% tint background
          <span className={styles.bestPill} style={{ background: `${color}26`, color }}>
            {score.score}
          </span>
        ) : (
          score.score
        )}
      </span>
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
    <button
      className={canAdd ? styles.addButton : `${styles.addButton} ${styles.addButtonDisabled}`}
      disabled={!canAdd}
      type={'button'}
    >
      <Icon icon={PlusIcon} size={12} />
      {t('ModelSwitchPanel.detail.rating.modal.compare.add')}
    </button>
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
              <span
                className={styles.chipRemove}
                role={'button'}
                onClick={() => setSelectedIds((prev) => prev.filter((id) => id !== model.id))}
              >
                <Icon icon={XIcon} size={12} />
              </span>
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
            <Tooltip
              title={t('ModelSwitchPanel.detail.rating.modal.compare.limit', {
                count: MAX_COMPARE_MODELS,
              })}
            >
              {addButton}
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
        <button
          className={styles.rulesToggle}
          type={'button'}
          onClick={() => setRulesOpen((prev) => !prev)}
        >
          <Icon icon={InfoIcon} size={12} />
          {t('ModelSwitchPanel.detail.rating.modal.rules.title')}
          <Icon icon={rulesOpen ? ChevronUpIcon : ChevronDownIcon} size={12} />
        </button>
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
