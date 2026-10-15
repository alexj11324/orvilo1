import { Brain } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ProviderIcon } from '@/components/BrandIcons/catalog';
import SearchBar from '@/components/SearchBar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

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
      <div className={`${styles.toolbar} flex w-full items-center justify-between gap-1 px-2 py-2`}>
        <div className="flex w-full min-w-0 flex-1 flex-col">
          <SearchBar
            className={styles.toolbarSearch}
            clearOnEscape={false}
            placeholder={t('ModelSwitchPanel.searchPlaceholder')}
            value={searchKeyword}
            visualSize="compact"
            onChange={(e) => onSearchKeywordChange(e.target.value)}
            onKeyDown={(event) => event.stopPropagation()}
          />
        </div>
        {showGroupModeSwitch && (
          <Tabs
            className={styles.toolbarTabs}
            value={groupMode}
            onValueChange={(value) => onGroupModeChange?.(value as GroupMode)}
          >
            <TabsList className={styles.toolbarTabList}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <TabsTrigger
                      aria-label={t('ModelSwitchPanel.byModel')}
                      className={styles.toolbarTab}
                      value="byModel"
                    >
                      <Brain aria-hidden="true" className="size-4" />
                    </TabsTrigger>
                  }
                />
                <TooltipContent>{t('ModelSwitchPanel.byModel')}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <TabsTrigger
                      aria-label={t('ModelSwitchPanel.byProvider')}
                      className={styles.toolbarTab}
                      value="byProvider"
                    >
                      <ProviderIcon aria-hidden="true" className="size-4" />
                    </TabsTrigger>
                  }
                />
                <TooltipContent>{t('ModelSwitchPanel.byProvider')}</TooltipContent>
              </Tooltip>
            </TabsList>
          </Tabs>
        )}
      </div>
    );
  },
);

Toolbar.displayName = 'Toolbar';
