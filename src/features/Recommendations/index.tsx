import { cn } from 'cn';
import { RefreshCw } from 'lucide-react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { DailyBriefRecommendations } from '@/business/client/DailyBriefRecommendations';
import {
  type DailyBriefRecommendationsUIState,
  useDailyBriefRecommendationsUI,
} from '@/business/client/useDailyBriefRecommendationsUI';
import { Button } from '@/components/ui/button';
import GroupBlock from '@/features/Home/components/GroupBlock';
import RailCard from '@/features/Home/components/RailCard';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { useEligibleActions } from './hooks/useEligibleActions';
import { RecommendationCard } from './RecommendationCard';
import { spinHoldMs } from './spinHold';
import { styles } from './style';

const isTaskTemplatesVisible = (state: DailyBriefRecommendationsUIState): boolean =>
  state.mode !== 'hidden';

const useSuggestionsHidden = (): boolean =>
  useGlobalStore(systemStatusSelectors.hiddenHomeWidgets).includes('suggestions');

export const useRecommendationsVisible = (): boolean => {
  const hidden = useSuggestionsHidden();
  const taskTemplatesState = useDailyBriefRecommendationsUI();
  const { actions } = useEligibleActions();
  if (hidden) return false;

  return actions.length > 0 || isTaskTemplatesVisible(taskTemplatesState);
};

interface RecommendationsProps {
  variant?: 'default' | 'main' | 'rail';
}

const Recommendations = memo<RecommendationsProps>(({ variant = 'default' }) => {
  const { t } = useTranslation('home');
  const { t: tCommon } = useTranslation('common');
  const hidden = useSuggestionsHidden();
  const taskTemplatesState = useDailyBriefRecommendationsUI();
  const { actions } = useEligibleActions();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const startedAtRef = useRef(0);

  const canRefresh = taskTemplatesState.mode === 'cards';
  const onRefresh = canRefresh ? taskTemplatesState.onRefresh : undefined;
  // keepPreviousData keeps the previous cards mounted while the refreshed key
  // validates. The visible mode therefore cannot tell us that the request has
  // settled; use SWR's validating state from the hook.
  const isSettled =
    taskTemplatesState.mode !== 'skeleton' &&
    (taskTemplatesState.mode !== 'cards' || !taskTemplatesState.isValidating);

  useEffect(() => {
    if (!isRefreshing || !isSettled) return;

    const timer = setTimeout(
      () => setIsRefreshing(false),
      spinHoldMs(Date.now() - startedAtRef.current),
    );

    return () => clearTimeout(timer);
  }, [isRefreshing, isSettled]);

  const handleRefresh = useCallback(() => {
    if (isRefreshing || !onRefresh) return;

    startedAtRef.current = Date.now();
    setIsRefreshing(true);
    onRefresh();
  }, [isRefreshing, onRefresh]);

  const showTaskTemplates = isTaskTemplatesVisible(taskTemplatesState);
  if (hidden) return null;
  if (actions.length === 0 && !showTaskTemplates) return null;

  // Rendered through the skeleton phase, not just in 'cards': the control that
  // started the refresh must not vanish while the refresh it started is running.
  const refresh = showTaskTemplates && (
    <Button
      disabled={!canRefresh && !isRefreshing}
      size="sm"
      title={tCommon('taskTemplate.action.refresh.button')}
      variant="ghost"
      onClick={handleRefresh}
    >
      <RefreshCw
        className={isRefreshing ? styles.refreshSpin : undefined}
        data-icon="inline-start"
        size={12}
      />
    </Button>
  );

  const compact = variant === 'rail';

  const body = (
    <div className="flex flex-col" style={{ gap: compact ? 2 : 8 }}>
      {actions.map((action) => (
        <RecommendationCard
          compact={compact}
          ctaKey={action.ctaKey}
          descriptionKey={action.descriptionKey}
          i18nValues={action.i18nValues}
          key={action.id}
          renderIcon={action.renderIcon}
          tagKey={action.tagKey}
          titleKey={action.titleKey}
          onAction={action.run}
        />
      ))}
      {showTaskTemplates ? (
        <DailyBriefRecommendations compact={compact} state={taskTemplatesState} />
      ) : null}
    </div>
  );

  if (variant === 'rail')
    return (
      <RailCard action={refresh} title={t('recommendations.title')}>
        {body}
      </RailCard>
    );

  // In the main column it is one section among the page's other headed blocks,
  // so it wears the same heading they do instead of its own subtitle line.
  if (variant === 'main')
    return (
      <GroupBlock action={refresh} title={t('recommendations.title')}>
        {body}
      </GroupBlock>
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 justify-between">
        <div className={cn('text-[12px]', styles.subtitle)}>{t('recommendations.subtitle')}</div>
        {taskTemplatesState.mode === 'cards' && (
          <Button size="sm" variant="ghost" onClick={taskTemplatesState.onRefresh}>
            <RefreshCw data-icon="inline-start" size={12} />
            {tCommon('taskTemplate.action.refresh.button')}
          </Button>
        )}
      </div>
      {body}
    </div>
  );
});

Recommendations.displayName = 'Recommendations';

export default Recommendations;
