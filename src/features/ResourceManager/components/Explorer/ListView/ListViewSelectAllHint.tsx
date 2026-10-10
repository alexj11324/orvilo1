import { cn } from 'cn';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import type { SelectAllState } from '@/features/ResourceManager/store/initialState';

import { getListViewMinWidth } from './ListItem/constants';
import { styles } from './styles';

interface ListViewSelectAllHintProps {
  dataLength: number;
  onSelectAllResources: () => Promise<void>;
  selectAllState: SelectAllState;
  selectedCount: number;
  showSelectAllHint: boolean;
  showUploader?: boolean;
  total?: number;
}

const ListViewSelectAllHint = ({
  dataLength,
  onSelectAllResources,
  selectedCount,
  selectAllState,
  showUploader = true,
  showSelectAllHint,
  total,
}: ListViewSelectAllHintProps) => {
  const { t } = useTranslation('components');
  const isAllResultsSelected = selectAllState === 'all' && total === selectedCount;

  if (!showSelectAllHint) return null;

  return (
    <div
      className={cn('flex flex-row items-center gap-1.5 flex-wrap', styles.selectAllHint)}
      style={{ minWidth: getListViewMinWidth(showUploader) }}
    >
      <span>
        {t(
          selectAllState === 'all'
            ? total
              ? isAllResultsSelected
                ? 'FileManager.total.allSelectedCount'
                : 'FileManager.total.selectedCount'
              : 'FileManager.total.allSelectedFallback'
            : 'FileManager.total.loadedSelectedCount',
          {
            count: selectedCount,
          },
        )}
      </span>
      {selectAllState !== 'all' && (
        <Button size="sm" variant="link" onClick={onSelectAllResources}>
          {total && total > dataLength
            ? t('FileManager.total.selectAll', {
                count: total,
              })
            : t('FileManager.total.selectAllFallback')}
        </Button>
      )}
    </div>
  );
};

export default ListViewSelectAllHint;
