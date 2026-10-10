import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

import { type ScoreResult } from '../../MCP/calculateScore';
import { sortItemsByPriority } from '../../MCP/calculateScore';

const getGradeColor = (grade: string): string => {
  switch (grade) {
    case 'a': {
      return 'var(--success)';
    }
    case 'b': {
      return 'var(--warning)';
    }
    case 'f': {
      return 'var(--destructive)';
    }
    default: {
      return 'var(--muted-foreground)';
    }
  }
};

const styles = {
  colorDot: 'size-2 rounded-[50%]',
  container: 'p-6 border border-sidebar-border rounded-[12px] bg-(--ant-color-fill-quaternary)',
  description: '[margin-block-start:8px] text-[14px] text-muted-foreground',
  gradeBadge:
    'flex-none size-8 border-2 border-solid border-current rounded-[50%] text-[16px] font-bold',
  gradeInfo: 'flex gap-3 items-center [margin-block-start:12px]',
  itemList: 'my-2 mx-0 ps-4 [&_li]:my-1 [&_li]:mx-0',
  legend: 'flex gap-4 [margin-block-start:8px] text-[12px]',
  legendItem: 'flex gap-1 items-center',
  progressContainer: '[margin-block-start:16px]',
  scoreText: 'text-[24px] font-semibold text-foreground',
  sectionTitle:
    '[margin-block:12px_6px] mx-0 [padding-block-start:8px] [border-block-start:1px_solid_var(--sidebar-border)] text-[14px] font-semibold text-foreground first-of-type:[padding-block-start:0] first-of-type:[border-block-start:none]',
  tooltipContent: 'max-w-100 leading-[1.5]',
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
      <div style={{ fontSize: '14px', marginBottom: '12px' }}>
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
          <div className={styles.sectionTitle} style={{ color: 'var(--destructive)' }}>
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
          <div className={styles.sectionTitle} style={{ color: 'var(--muted-foreground)' }}>
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
    <div
      className="flex flex-col gap-3 p-4"
      style={{ border: `1px solid var(--border)`, borderRadius: 'var(--ant-border-radius-lg)' }}
    >
      <div className="flex items-start justify-between">
        <div className="flex flex-col">
          <h2 style={{ fontWeight: 'bold', margin: 0 }}>
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
              <span style={{ display: 'inline-flex' }}>
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
              <div style={{ fontWeight: 'bold', marginBottom: 8 }}>
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
        <span style={{ fontSize: '16px', fontWeight: 600 }}>
          {totalScore}/{maxScore} {t('mcp.details.totalScore.scoreInfo.points')}
        </span>
        <span style={{ color: getGradeColor(grade), fontWeight: 600 }}>
          {Math.round(percentage)}%
        </span>
        <span style={{ color: getGradeColor(grade), fontSize: '14px' }}>
          {t('mcp.details.totalScore.scoreInfo.requiredItems')}: {completedRequiredItems}/
          {totalRequiredItems} {t('mcp.details.totalScore.scoreInfo.items')}
        </span>
      </div>
    </div>
  );
});

export default TotalScore;
