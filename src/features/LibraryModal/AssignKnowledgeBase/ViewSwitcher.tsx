import { createStaticStyles, cx } from 'antd-style';
import { Grid3x3Icon, ListIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';

export type ViewMode = 'list' | 'masonry';

interface ViewSwitcherProps {
  onViewChange: (view: ViewMode) => void;
  view: ViewMode;
}

const styles = createStaticStyles(({ css }) => ({
  container: css`
    gap: 4px;
  `,
}));

const ViewSwitcher = memo<ViewSwitcherProps>(({ onViewChange, view }) => {
  const { t } = useTranslation('components');

  return (
    <div className={cx('flex flex-row', styles.container)}>
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
