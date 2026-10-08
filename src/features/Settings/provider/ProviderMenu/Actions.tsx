import { type MenuProps } from '@lobehub/ui';
import { DropdownMenu } from '@lobehub/ui';
import { ActionIcon } from '@lobehub/ui/base-ui';
import { MoreHorizontalIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

interface ActionsProps {
  dropdownMenu: MenuProps['items'];
}

const Actions = memo<ActionsProps>(({ dropdownMenu }) => {
  const { t: tCommon } = useTranslation('common');
  return (
    <DropdownMenu items={dropdownMenu}>
      <ActionIcon
        aria-label={tCommon('more')}
        icon={MoreHorizontalIcon}
        size={'small'}
        style={{ flex: 'none' }}
      />
    </DropdownMenu>
  );
});

export default Actions;
