import { ListFilter } from 'lucide-react';
import { memo } from 'react';

import ActionIcon from '@/components/ActionIcon';
import { DropdownMenu } from '@/components/ItemsMenu';

import { useTopicFilterDropdownMenu } from './useFilterMenu';

const Filter = memo(() => {
  const menuItems = useTopicFilterDropdownMenu();

  return (
    <DropdownMenu items={menuItems}>
      <ActionIcon icon={ListFilter} size={'small'} />
    </DropdownMenu>
  );
});

export default Filter;
