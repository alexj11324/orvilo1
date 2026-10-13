import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { type ScoreResult } from '../../MCP/calculateScore';
import { sortItemsByPriority } from '../../MCP/calculateScore';

const getGradeColor = (grade: string): string => {
  switch (grade) {
    case 'a': {
      return 'var(--success-text)';
    }
    case 'b': {
      return 'var(--warning-text)';
    }
    case 'f': {
      return 'var(--destructive-text)';
    }
    default: {
      return 'var(--muted-foreground)';
    }
  }
};

const styles = {
  colorDot: 'size-2 rounded-full',
  container: 'p-6 border border-sidebar-border rounded-(--radius-card) bg-fill-quaternary',
  description: 'mbs-2 text-sm text-muted-foreground',
  gradeBadge:
    'flex-none size-8 border-2 border-solid border-current rounded-full text-base font-semibold',
  gradeInfo: 'flex gap-3 items-center mbs-3',
  itemList: 'my-2 mx-0 ps-4 [&_li]:my-1 [&_li]:mx-0',
  legend: 'flex gap-4 mbs-2 text-xs',
  legendItem: 'flex gap-1 items-center',
  progressContainer: 'mbs-4',
  scoreText: 'text-2xl font-semibold text-foreground',
  sectionTitle:
    'mbs-3 mbe-1.5 mx-0 pbs-2 border-bs border-sidebar-border text-sm leading-5.5 font-semibold text-foreground first-of-type:pbs-0 first-of-type:border-bs-0',
  tooltipContent: 'max-w-100 text-sm leading-5.5',
};

interface ScoreItem {
  check: boolean;
  required?: boolean;
  title: string;
  weight?: number;
}

interface TotalScoreProps {
  isValidated?: boolean;
  scoreItems?: ScoreItem[];
  scoreResult: ScoreResult;
}

const TotalScore = memo<TotalScoreProps>(({ scoreResult, scoreItems = [], isValidated }) => {
  const { t } = useTranslation('discover');

  const { totalScore, maxScore, percentage, grade } = scoreResult;

  // Segment-level color configuration using theme colors
  const SEGMENT_COLORS = {
    // Green (80-100%)
    A_COLOR: 'var(--success)',

    // Yellow (60-85%)
    B_COLOR: 'var(--warning)',

    // Red (0-60%)
    F_COLOR: 'var(--destructive)',
  };

  const allItems = sortItemsByPriority([...scoreItems]);
  const completedRequired = allItems.filter((item) => item.required && item.check);
  const incompleteRequired = allItems.filter((item) => item.required && !item.check);
  const completedOptional = allItems.filter((item) => !item.required && item.check);
  const incompleteOptional = allItems.filter((item) => !item.required && !item.check);

  // Count the number of required items
  const totalRequiredItems = completedRequired.length + incompleteRequired.length;
  const completedRequiredItems = completedRequired.length;

  // Generate tooltip content
  const renderTooltipContent = () => (
    <div className={styles.tooltipContent}>
      <div className="mb-3 text-sm leading-5.5">
        <strong>
          {totalScore}/{maxScore} {t('mcp.details.totalScore.scoreInfo.points')} (
          {Math.round(percentage)}%)
        </strong>
      </div>

      {completedRequired.length > 0 && (
        <>
          <div className={styles.sectionTitle} style={{ color: getGradeColor(grade) }}>
            {t('mcp.details.totalScore.popover.completedRequired', {
              count: completedRequired.length,
            })}
            :
          </div>
          <ul className={styles.itemList}>
            {completedRequired.map((item, index) => (
              <li key={index}>{item.title}</li>
            ))}
          </ul>
        </>
      )}

      {incompleteRequired.length > 0 && (
        <>
          <div className={cn(styles.sectionTitle, 'text-destructive-text')}>
            {t('mcp.details.totalScore.popover.incompleteRequired', {
              count: incompleteRequired.length,
            })}
            :
          </div>
          <ul className={styles.itemList}>
            {incompleteRequired.map((item, index) => (
              <li key={index}>{item.title}</li>
            ))}
          </ul>
        </>
      )}

      {completedOptional.length > 0 && (
        <>
          <div className={styles.sectionTitle} style={{ color: getGradeColor(grade) }}>
            {t('mcp.details.totalScore.popover.completedOptional', {
              count: completedOptional.length,
            })}
            :
          </div>
          <ul className={styles.itemList}>
            {completedOptional.map((item, index) => (
              <li key={index}>{item.title}</li>
            ))}
          </ul>
        </>
      )}

      {incompleteOptional.length > 0 && (
        <>
          <div className={cn(styles.sectionTitle, 'text-muted-foreground')}>
            {t('mcp.details.totalScore.popover.incompleteOptional', {
              count: incompleteOptional.length,
            })}
            :
          </div>
          <ul className={styles.itemList}>
            {incompleteOptional.map((item, index) => (
              <li key={index}>{item.title}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-3 rounded-(--radius-card) border border-border p-4">
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <h2 className="m-0 text-xl leading-7 font-semibold">
            {t(`mcp.details.scoreLevel.${grade}.fullTitle`)}
          </h2>
          <div className={styles.description}>{t(`mcp.details.scoreLevel.${grade}.desc`)}</div>
        </div>
        {isValidated && (
          <div
            className={cn('flex flex-col items-center justify-center', styles.gradeBadge)}
            style={{
              borderColor: getGradeColor(grade),
              color: getGradeColor(grade),
            }}
          >
            {grade.toUpperCase()}
          </div>
        )}
      </div>

      <div className={styles.progressContainer}>
        <Popover>
          <PopoverTrigger
            openOnHover
            render={
              <span className="inline-flex">
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor:
                        percentage < 60
                          ? SEGMENT_COLORS.F_COLOR
                          : percentage < 80
                            ? SEGMENT_COLORS.B_COLOR
                            : SEGMENT_COLORS.A_COLOR,
                      width: `${Math.round(percentage)}%`,
                    }}
                  />
                </div>
              </span>
            }
          />
          <PopoverContent side="bottom">
            <div>
              <div className="mb-2 text-sm leading-5.5 font-semibold">
                {t('mcp.details.totalScore.popover.title')}
              </div>
              {renderTooltipContent()}
            </div>
          </PopoverContent>
        </Popover>

        <div className={styles.legend}>
          <div className={styles.legendItem}>
            <div className={styles.colorDot} style={{ backgroundColor: SEGMENT_COLORS.F_COLOR }} />
            <span>{t('mcp.details.totalScore.legend.fGrade', { maxPercent: 60 })}</span>
          </div>
          <div className={styles.legendItem}>
            <div className={styles.colorDot} style={{ backgroundColor: SEGMENT_COLORS.B_COLOR }} />
            <span>
              {t('mcp.details.totalScore.legend.bGrade', { maxPercent: 80, minPercent: 60 })}
            </span>
          </div>
          <div className={styles.legendItem}>
            <div className={styles.colorDot} style={{ backgroundColor: SEGMENT_COLORS.A_COLOR }} />
            <span>{t('mcp.details.totalScore.legend.aGrade', { minPercent: 80 })}</span>
          </div>
        </div>
      </div>

      <div className={styles.gradeInfo}>
        <span className="text-base leading-6 font-semibold">
          {totalScore}/{maxScore} {t('mcp.details.totalScore.scoreInfo.points')}
        </span>
        <span className="font-semibold" style={{ color: getGradeColor(grade) }}>
          {Math.round(percentage)}%
        </span>
        <span className="text-sm leading-5.5" style={{ color: getGradeColor(grade) }}>
          {t('mcp.details.totalScore.scoreInfo.requiredItems')}: {completedRequiredItems}/
          {totalRequiredItems} {t('mcp.details.totalScore.scoreInfo.items')}
        </span>
      </div>
    </div>
  );
});

export default TotalScore;
