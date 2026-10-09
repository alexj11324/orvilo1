import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { type DropdownItem, DropdownMenu } from '@/components/ItemsMenu';

interface ActionProps {
  dropdownMenu: DropdownItem[] | (() => DropdownItem[]);
}

const Actions = memo<ActionProps>(({ dropdownMenu }) => {
  const { t: tCommon } = useTranslation('common');
  return (
    <DropdownMenu items={dropdownMenu}>
      <ActionIcon aria-label={tCommon('more')} icon={MoreHorizontalIcon} size={'small'} />
    </DropdownMenu>
  );
});

export default Actions;
