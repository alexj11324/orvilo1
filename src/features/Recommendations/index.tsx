import { cn } from 'cn';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import GroupBlock from '@/features/Home/components/GroupBlock';
import RailCard from '@/features/Home/components/RailCard';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import { useEligibleActions } from './hooks/useEligibleActions';
import { RecommendationCard } from './RecommendationCard';
import { styles } from './style';

const useSuggestionsHidden = (): boolean =>
  useGlobalStore(systemStatusSelectors.hiddenHomeWidgets).includes('suggestions');

export const useRecommendationsVisible = (): boolean => {
  const hidden = useSuggestionsHidden();
  const { actions } = useEligibleActions();
  if (hidden) return false;

  return actions.length > 0;
};

interface RecommendationsProps {
  variant?: 'default' | 'main' | 'rail';
}

const Recommendations = memo<RecommendationsProps>(({ variant = 'default' }) => {
  const { t } = useTranslation('home');
  const hidden = useSuggestionsHidden();
  const { actions } = useEligibleActions();

  if (hidden || actions.length === 0) return null;

  const compact = variant === 'rail';

  const body = (
    <div className={cn('flex flex-col', compact ? 'gap-0.5' : 'gap-2')}>
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
    </div>
  );

  if (variant === 'rail') return <RailCard title={t('recommendations.title')}>{body}</RailCard>;

  // In the main column it is one section among the page's other headed blocks,
  // so it wears the same heading they do instead of its own subtitle line.
  if (variant === 'main') return <GroupBlock title={t('recommendations.title')}>{body}</GroupBlock>;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 justify-between">
        <div className={cn('text-xs leading-5', styles.subtitle)}>
          {t('recommendations.subtitle')}
        </div>
      </div>
      {body}
    </div>
  );
});

Recommendations.displayName = 'Recommendations';

export default Recommendations;
