import { Check, Grid3x3Icon, ListIcon } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { DropdownMenu } from '@/components/ItemsMenu';
import { type MenuProps } from '@/components/Menu';

import { useViewMode } from '../hooks/useViewMode';
import ActionIconWithChevron from './ActionIconWithChevron';

/**
 * Self-contained view mode switcher with automatic URL sync
 */
const ViewSwitcher = memo(() => {
  const { t } = useTranslation('components');

  const [viewMode, setViewMode] = useViewMode();

  const currentViewIcon = viewMode === 'list' ? ListIcon : Grid3x3Icon;
  const currentViewLabel =
    viewMode === 'list' ? t('FileManager.view.list') : t('FileManager.view.masonry');

  const menuItems: MenuProps['items'] = useMemo(
    () => [
      {
        extra:
          viewMode === 'list' ? (
            <span className="anticon" role="img">
              <Check fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
          ) : undefined,
        icon: (
          <span className="anticon" role="img">
            <ListIcon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
          </span>
        ),
        key: 'list',
        label: t('FileManager.view.list'),
        onClick: () => setViewMode('list'),
      },
      {
        extra:
          viewMode === 'masonry' ? (
            <span className="anticon" role="img">
              <Check fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
            </span>
          ) : undefined,
        icon: (
          <span className="anticon" role="img">
            <Grid3x3Icon fill={'transparent'} height={'1em'} size={'1em'} width={'1em'} />
          </span>
        ),
        key: 'masonry',
        label: t('FileManager.view.masonry'),
        onClick: () => setViewMode('masonry'),
      },
    ],
    [setViewMode, t, viewMode],
  );

  return (
    <DropdownMenu items={menuItems} placement="bottomRight">
      <ActionIconWithChevron icon={currentViewIcon} title={currentViewLabel} />
    </DropdownMenu>
  );
});

export default ViewSwitcher;
