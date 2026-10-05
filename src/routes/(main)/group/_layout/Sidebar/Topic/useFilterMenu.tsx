import { LucideCheck } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { DropdownItem } from '@/components/ItemsMenu';
import { useUserStore } from '@/store/user';
import { preferenceSelectors } from '@/store/user/selectors';
import type { TopicGroupMode, TopicSortBy } from '@/types/topic';

export const useTopicFilterDropdownMenu = (): DropdownItem[] => {
  const { t } = useTranslation('topic');

  const [topicGroupMode, topicSortBy, updatePreference] = useUserStore((s) => [
    preferenceSelectors.topicGroupMode(s),
    preferenceSelectors.topicSortBy(s),
    s.updatePreference,
  ]);

  return useMemo(() => {
    const groupModes: TopicGroupMode[] = ['byTime', 'byProject', 'flat'];
    const sortByOptions: TopicSortBy[] = ['createdAt', 'updatedAt'];

    return [
      {
        children: groupModes.map((mode) => ({
          icon: topicGroupMode === mode ? <LucideCheck /> : <div />,
          key: `group-${mode}`,
          label: t(`filter.groupMode.${mode}`),
          onClick: () => {
            updatePreference({ topicGroupMode: mode });
          },
        })),
        key: 'organize',
        label: t('filter.organize'),
        type: 'group' as const,
      },
      { type: 'divider' as const },
      {
        children: sortByOptions.map((option) => ({
          icon: topicSortBy === option ? <LucideCheck /> : <div />,
          key: `sort-${option}`,
          label: t(`filter.sortBy.${option}`),
          onClick: () => {
            updatePreference({ topicSortBy: option });
          },
        })),
        key: 'sort',
        label: t('filter.sort'),
        type: 'group' as const,
      },
    ];
  }, [topicGroupMode, topicSortBy, updatePreference, t]);
};
