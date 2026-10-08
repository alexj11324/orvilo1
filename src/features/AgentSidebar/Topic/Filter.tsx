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
      <ActionIcon
        className="data-[popup-open]:bg-muted data-[popup-open]:hover:bg-accent data-[popup-open]:text-foreground"
        icon={ListFilter}
        size={'small'}
        title={t('filter.organize')}
      />
    </DropdownMenu>
  );
});

export default Filter;
