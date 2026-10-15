import { Tooltip } from '@lobehub/ui';
import { Tabs } from '@lobehub/ui/base-ui';
import { cn } from 'cn';
import { Brain } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ProviderIcon } from '@/components/icons';
import SearchBar from '@/components/SearchBar';

import { styles } from '../styles';
import { type GroupMode } from '../types';

interface ToolbarProps {
  groupMode?: GroupMode;
  onGroupModeChange?: (mode: GroupMode) => void;
  onSearchKeywordChange: (keyword: string) => void;
  searchKeyword: string;
  showGroupModeSwitch?: boolean;
}

export const Toolbar = memo<ToolbarProps>(
  ({ groupMode, onGroupModeChange, searchKeyword, onSearchKeywordChange, showGroupModeSwitch }) => {
    const { t } = useTranslation('components');

    return (
      <div
        className={cn('flex items-center gap-1 justify-between py-2 px-2 w-full', styles.toolbar)}
      >
        <div className="flex flex-col flex-1 w-full">
          <SearchBar
            className={styles.toolbarSearch}
            clearOnEscape={false}
            placeholder={t('ModelSwitchPanel.searchPlaceholder')}
            value={searchKeyword}
            visualSize="compact"
            onChange={(e) => onSearchKeywordChange(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </div>
        {showGroupModeSwitch && (
          <Tabs
            activeKey={groupMode}
            className={styles.toolbarTabs}
            size="small"
            classNames={{
              list: styles.toolbarTabList,
              tab: styles.toolbarTab,
              indicator: styles.toolbarIndicator,
            }}
            items={[
              {
                key: 'byModel',
                label: (
                  <Tooltip title={t('ModelSwitchPanel.byModel')}>
                    <Brain size={16} />
                  </Tooltip>
                ),
              },
              {
                key: 'byProvider',
                label: (
                  <Tooltip title={t('ModelSwitchPanel.byProvider')}>
                    <ProviderIcon size={16} />
                  </Tooltip>
                ),
              },
            ]}
            onChange={(key) => onGroupModeChange?.(key as GroupMode)}
          />
        )}
      </div>
    );
  },
);

Toolbar.displayName = 'Toolbar';
