import { CheckIcon } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { type SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';

// Sort type enumeration
export enum SortType {
  Alphabetical = 'alphabetical',
  AlphabeticalDesc = 'alphabeticalDesc',
  Default = 'default',
}

interface DropdownMenuProps {
  onSortChange: (sortType: SortType) => void;
  sortType: SortType;
}

export const useProviderDropdownMenu = ({
  onSortChange,
  sortType,
}: DropdownMenuProps): SidebarMenuItems => {
  const { t } = useTranslation('modelProvider');

  return useMemo(() => {
    // Unchecked rows keep a blank slot so every label aligns with the checked one.
    const checkIcon = (type: SortType) =>
      sortType === type ? <CheckIcon /> : <span className="size-4" />;

    return [
      {
        icon: checkIcon(SortType.Default),
        key: 'default',
        label: t('menu.list.disabledActions.sortDefault'),
        onClick: () => onSortChange(SortType.Default),
      },
      {
        type: 'divider' as const,
      },
      {
        icon: checkIcon(SortType.Alphabetical),
        key: 'alphabetical',
        label: t('menu.list.disabledActions.sortAlphabetical'),
        onClick: () => onSortChange(SortType.Alphabetical),
      },
      {
        icon: checkIcon(SortType.AlphabeticalDesc),
        key: 'alphabeticalDesc',
        label: t('menu.list.disabledActions.sortAlphabeticalDesc'),
        onClick: () => onSortChange(SortType.AlphabeticalDesc),
      },
    ];
  }, [sortType, onSortChange, t]);
};
