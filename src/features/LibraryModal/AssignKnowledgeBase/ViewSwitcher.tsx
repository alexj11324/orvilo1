import { Grid3x3Icon, ListIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';

export type ViewMode = 'list' | 'masonry';

interface ViewSwitcherProps {
  onViewChange: (view: ViewMode) => void;
  view: ViewMode;
}

const ViewSwitcher = memo<ViewSwitcherProps>(({ onViewChange, view }) => {
  const { t } = useTranslation('components');

  return (
    <div className={'flex flex-row gap-1'}>
      <ActionIcon
        active={view === 'list'}
        icon={ListIcon}
        size={16}
        title={t('FileManager.view.list')}
        onClick={() => onViewChange('list')}
      />
      <ActionIcon
        active={view === 'masonry'}
        icon={Grid3x3Icon}
        size={16}
        title={t('FileManager.view.masonry')}
        onClick={() => onViewChange('masonry')}
      />
    </div>
  );
});

export default ViewSwitcher;
