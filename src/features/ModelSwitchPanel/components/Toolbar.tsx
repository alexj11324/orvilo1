import { Flexbox, Icon, stopPropagation } from '@lobehub/ui';
import { ProviderIcon } from '@lobehub/ui/icons';
import { Brain } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

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
      <Flexbox
        horizontal
        align="center"
        className={styles.toolbar}
        gap={4}
        justify="space-between"
        paddingBlock={8}
        paddingInline={8}
        width="100%"
      >
        <Flexbox flex={1} width="100%">
          <SearchBar
            className={styles.toolbarSearch}
            clearOnEscape={false}
            placeholder={t('ModelSwitchPanel.searchPlaceholder')}
            value={searchKeyword}
            visualSize="compact"
            onChange={(e) => onSearchKeywordChange(e.target.value)}
            onKeyDown={stopPropagation}
          />
        </Flexbox>
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
              ).map(([mode, icon]) => (
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
                    <Icon icon={icon} size={16} />
                  </TooltipTrigger>
                  <TooltipContent>{t(`ModelSwitchPanel.${mode}`)}</TooltipContent>
                </Tooltip>
              ))}
            </TabsList>
          </Tabs>
        )}
      </Flexbox>
    );
  },
);

Toolbar.displayName = 'Toolbar';
