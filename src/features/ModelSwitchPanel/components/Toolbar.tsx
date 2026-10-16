import { cn } from 'cn';
import { Brain } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { ProviderIcon } from '@/components/icons';
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
            className={styles.toolbarTabs}
            value={groupMode}
            onValueChange={(key) => onGroupModeChange?.(key as GroupMode)}
          >
            <TabsList className={styles.toolbarTabList}>
              {(
                [
                  ['byModel', Brain],
                  ['byProvider', ProviderIcon],
                ] as const
              ).map(([mode, ModeIcon]) => (
                <Tooltip key={mode}>
                  <TooltipTrigger
                    render={
                      <TabsTrigger
                        aria-label={t(`ModelSwitchPanel.${mode}`)}
                        className={styles.toolbarTab}
                        value={mode}
                      />
                    }
                  >
                    <ModeIcon size={16} />
                  </TooltipTrigger>
                  <TooltipContent>{t(`ModelSwitchPanel.${mode}`)}</TooltipContent>
                </Tooltip>
              ))}
            </TabsList>
          </Tabs>
        )}
      </div>
    );
  },
);

Toolbar.displayName = 'Toolbar';
