import { ListFilter } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { DropdownMenu } from '@/components/ItemsMenu';

import { useTopicFilterDropdownMenu } from './useFilterMenu';

const Filter = memo(() => {
  const { t } = useTranslation('topic');
  const menuItems = useTopicFilterDropdownMenu();

  return (
    <DropdownMenu items={menuItems}>
      <ActionIcon aria-label={t('filter.title')} icon={ListFilter} size={'small'} />
    </DropdownMenu>
  );
});

export default Filter;
