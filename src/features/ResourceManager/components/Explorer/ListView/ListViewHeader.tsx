import { cn } from 'cn';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { useGlobalStore } from '@/store/global';
import type { FileListItem } from '@/types/files';

import {
  useExplorerSelectionActions,
  useExplorerSelectionSummary,
} from '../hooks/useExplorerSelection';
import ColumnResizeHandle from './ColumnResizeHandle';
import { getListViewMinWidth } from './ListItem/constants';
import ListViewSelectAllHint from './ListViewSelectAllHint';
import { styles } from './styles';

interface ListViewHeaderProps {
  columnWidths: {
    date: number;
    name: number;
    size: number;
    uploader: number;
  };
  data: FileListItem[];
  hasMore: boolean;
  showUploader?: boolean;
}

const ListViewHeader = ({
  columnWidths,
  data,
  hasMore,
  showUploader = true,
}: ListViewHeaderProps) => {
  const { t } = useTranslation(['components', 'file']);
  const updateColumnWidth = useGlobalStore((s) => s.updateResourceManagerColumnWidth);
  const { handleSelectAll, handleSelectAllResources } = useExplorerSelectionActions(data);
  const {
    allSelected,
    hasSelectableItems,
    indeterminate,
    selectAllState,
    selectableCount,
    selectedCount,
    showSelectAllHint,
    total,
  } = useExplorerSelectionSummary({
    data,
    hasMore,
  });
  const isAllResultsSelected = selectAllState === 'all' && total === selectedCount;
  const selectedLabelKey =
    selectAllState === 'all'
      ? total
        ? isAllResultsSelected
          ? 'FileManager.total.allSelectedCount'
          : 'FileManager.total.selectedCount'
        : 'FileManager.total.allSelectedFallback'
      : 'FileManager.total.selectedCount';
  const handleSelectAllResults = useCallback(
    (checked?: boolean) => {
      if (checked !== false && !hasMore) {
        void handleSelectAllResources();
        return;
      }

      handleSelectAll(checked);
    },
    [handleSelectAll, handleSelectAllResources, hasMore],
  );

  return (
    <>
      <div
        className={cn('flex flex-row items-center px-2', styles.header)}
        style={{
          borderBlockEnd: `1px solid var(--sidebar-border)`,
          fontSize: 12,
          minWidth: getListViewMinWidth(showUploader),
        }}
      >
        <div
          className="flex flex-col items-center justify-center h-[40px]"
          style={{ paddingInline: 4 }}
        >
          <Checkbox
            checked={allSelected}
            disabled={!hasSelectableItems}
            indeterminate={indeterminate}
            onCheckedChange={handleSelectAllResults}
          />
        </div>
        <div
          className={cn('flex flex-col justify-center', styles.headerItem)}
          style={{
            flexShrink: 0,
            maxWidth: columnWidths.name,
            minWidth: columnWidths.name,
            paddingInline: 20,
            paddingInlineEnd: 16,
            position: 'relative',
            width: columnWidths.name,
          }}
        >
          {selectedCount > 0 || selectAllState === 'all'
            ? t(selectedLabelKey, {
                count: selectedCount,
                ns: 'components',
              })
            : t('FileManager.title.title')}
          <ColumnResizeHandle
            column="name"
            currentWidth={columnWidths.name}
            maxWidth={1200}
            minWidth={200}
            onResize={(width) => updateColumnWidth('name', width)}
          />
        </div>
        <div
          className={cn('flex flex-col justify-center', styles.headerItem)}
          style={{
            flexShrink: 0,
            paddingInlineEnd: 16,
            position: 'relative',
            width: columnWidths.date,
          }}
        >
          {t('FileManager.title.createdAt')}
          <ColumnResizeHandle
            column="date"
            currentWidth={columnWidths.date}
            maxWidth={300}
            minWidth={120}
            onResize={(width) => updateColumnWidth('date', width)}
          />
        </div>
        {showUploader && (
          <div
            className={cn('flex flex-col justify-center', styles.headerItem)}
            style={{
              flexShrink: 0,
              paddingInlineEnd: 16,
              position: 'relative',
              width: columnWidths.uploader,
            }}
          >
            {t('FileManager.title.uploader')}
            <ColumnResizeHandle
              column="uploader"
              currentWidth={columnWidths.uploader}
              maxWidth={300}
              minWidth={120}
              onResize={(width) => updateColumnWidth('uploader', width)}
            />
          </div>
        )}
        <div
          className={cn('flex flex-col justify-center', styles.headerItem)}
          style={{
            flexShrink: 0,
            paddingInlineEnd: 16,
            position: 'relative',
            width: columnWidths.size,
          }}
        >
          {t('FileManager.title.size')}
          <ColumnResizeHandle
            column="size"
            currentWidth={columnWidths.size}
            maxWidth={200}
            minWidth={80}
            onResize={(width) => updateColumnWidth('size', width)}
          />
        </div>
      </div>
      <ListViewSelectAllHint
        dataLength={selectableCount}
        selectAllState={selectAllState}
        selectedCount={selectedCount}
        showSelectAllHint={showSelectAllHint}
        showUploader={showUploader}
        total={total}
        onSelectAllResources={handleSelectAllResources}
      />
    </>
  );
};

export default ListViewHeader;
