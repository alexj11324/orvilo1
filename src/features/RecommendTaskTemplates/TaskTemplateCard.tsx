import type { TaskTemplate } from '@orvilo/const';
import { cssVar, cx } from 'antd-style';
import { Clock, X } from 'lucide-react';
import { memo, type MouseEvent, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Badge } from '@/components/reui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import BriefCardSummary from '@/features/DailyBrief/BriefCardSummary';
import { styles as briefStyles } from '@/features/DailyBrief/style';
import { homeType } from '@/features/Home/components/homeType';
import { RECOMMENDATION_ICON_SIZE } from '@/features/Recommendations/iconSize';

import { ConnectorAuthRow } from './ConnectorAuthRow';
import { resolveTemplateIcon } from './resolveTemplateIcon';
import { styles } from './style';
import { INTEREST_ICON_MAP, TemplateBriefIcon } from './TemplateBriefIcon';
import { useScheduleText } from './useScheduleText';
import { useTaskTemplateCreate } from './useTaskTemplateCreate';
import { useVisibleAuthSpecs } from './useVisibleAuthSpecs';

interface TaskTemplateCardProps {
  /** Rail rendering: one scannable line per suggestion, detail lives in the modal. */
  compact?: boolean;
  onCreated: (templateId: number) => void;
  onDismiss: (templateId: number) => void;
  template: TaskTemplate;
}

export const TaskTemplateCard = memo<TaskTemplateCardProps>(
  ({ compact, template, onCreated, onDismiss }) => {
    const { t } = useTranslation('common');

    const iconSpec = useMemo(() => resolveTemplateIcon(template, INTEREST_ICON_MAP), [template]);
    const visibleAuthSpecs = useVisibleAuthSpecs(template, { hideMainIconProvider: true });
    const title = template.title;
    const description = template.description;

    const {
      created,
      disabled,
      handleAddTask,
      handleConnectError,
      loading,
      pendingCreate,
      primaryButtonLabel,
    } = useTaskTemplateCreate({ description, onCreated, template, title });

    const scheduleText = useScheduleText(template.cronPattern);

    const handleDismiss = useCallback(
      (event: MouseEvent) => {
        event.stopPropagation();
        if (loading || created) return;
        onDismiss(template.id);
      },
      [created, loading, onDismiss, template.id],
    );

    const handleOpenDetail = useCallback(() => {
      void import('./TaskTemplateDetailModal').then(({ createTaskTemplateDetailModal }) =>
        createTaskTemplateDetailModal({ onCreated, template }),
      );
    }, [onCreated, template]);

    const handlePrimaryClick = useCallback(
      (event: MouseEvent) => {
        event.stopPropagation();
        handleAddTask();
      },
      [handleAddTask],
    );

    if (compact)
      return (
        <div className={cx('flex flex-row items-center gap-1', styles.compactRow)}>
          <Button
            className={styles.compactMain}
            disabled={loading || pendingCreate}
            variant="ghost"
            onClick={handleOpenDetail}
          >
            <div className="flex flex-row items-start gap-2.5" style={{ width: '100%' }}>
              <div className="flex flex-col flex-none py-[2px]">
                <TemplateBriefIcon spec={iconSpec} tileSize={RECOMMENDATION_ICON_SIZE.compact} />
              </div>
              <span
                className={cx(homeType.itemTitleProse, styles.compactTitle)}
                style={{ flex: 1 }}
              >
                {title}
              </span>
            </div>
          </Button>
          <ActionIcon
            className={`${styles.dismissBtn} task-template-dismiss`}
            icon={X}
            size={'small'}
            title={t('taskTemplate.action.dismiss.tooltip')}
            onClick={handleDismiss}
          />
        </div>
      );

    const primaryButton = (
      <Button
        className={cx(briefStyles.actionBtnPrimary, 'rounded-full')}
        disabled={disabled}
        loading={loading || pendingCreate}
        variant="default"
        onClick={handlePrimaryClick}
      >
        {primaryButtonLabel}
      </Button>
    );

    return (
      <div
        style={{ borderRadius: cssVar.borderRadiusLG, cursor: 'pointer' }}
        className={cx(
          briefStyles.card,
          styles.card,
          'rounded-md border bg-card flex flex-col gap-3 p-3',
        )}
        onClick={handleOpenDetail}
      >
        <div className="flex flex-row items-center gap-4 justify-between">
          <div
            className="flex flex-row items-center gap-2"
            style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}
          >
            <TemplateBriefIcon spec={iconSpec} tileSize={RECOMMENDATION_ICON_SIZE.regular} />
            <div
              className="flex flex-row items-center flex-1 gap-1.5"
              style={{ minWidth: 0, overflow: 'hidden' }}
            >
              <span className="truncate text-[16px] font-medium">{title}</span>
              <ActionIcon
                icon={Clock}
                size={12}
                title={
                  <div className="flex flex-col items-center justify-center">
                    <span>{scheduleText}</span>
                    {t('taskTemplate.schedule.editableAfterCreateTooltip')}
                  </div>
                }
              />
            </div>
          </div>

          <div className="flex flex-row items-center gap-2">
            <ActionIcon
              className={`${styles.dismissBtn} task-template-dismiss`}
              icon={X}
              size={'small'}
              title={t('taskTemplate.action.dismiss.tooltip')}
              onClick={handleDismiss}
            />
          </div>
        </div>
        <Separator className="border-dashed" style={{ marginBlock: 0 }} />
        {description.trim().length > 0 ? <BriefCardSummary summary={description} /> : null}
        {visibleAuthSpecs.length > 0 && (
          <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
            {visibleAuthSpecs.map((spec) => (
              <ConnectorAuthRow
                disabled={disabled}
                key={`${spec.source}:${spec.identifier}`}
                spec={spec}
                onError={handleConnectError}
              />
            ))}
          </div>
        )}
        <div className="flex flex-row items-center gap-2 justify-between flex-wrap">
          <div className="flex flex-row items-center gap-2">
            <Badge size="sm" variant="outline">
              {t('taskTemplate.card.templateTag')}
            </Badge>
          </div>
          <div className="flex flex-row items-center gap-2">{primaryButton}</div>
        </div>
      </div>
    );
  },
);

TaskTemplateCard.displayName = 'TaskTemplateCard';
