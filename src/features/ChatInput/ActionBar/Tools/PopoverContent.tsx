import { createStaticStyles, cssVar, cx } from 'antd-style';
import { Pin, Search, Settings, X, Zap } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import type { ActionMenuItem } from '../../menuItems';
import { usePopoverClose } from '../components/ActionPopover';
import { ScrollSignalProvider } from './ScrollSignalContext';
import SkillActivateMode from './SkillActivateMode';
import ToolsList from './ToolsList';

// colorFill has no exact local semantic alias; retain these divider color contracts.
const themeStyles = createStaticStyles(({ css }) => ({
  footer: css`
    border-block-start: 1px solid ${cssVar.colorFill};
  `,
  header: css`
    border-block-end: 1px solid ${cssVar.colorFill};
  `,
}));

const styles = {
  footer: cx('flex items-center gap-3.5 py-1.5 px-3', themeStyles.footer),
  header: cx('py-2 px-2', themeStyles.header),
  iconButton:
    'cursor-pointer inline-flex flex-none items-center justify-center p-0 border-0 rounded-(--radius-button) text-foreground-tertiary bg-transparent transition-[color,background] duration-200 ease-[ease] active:not-aria-[haspopup]:translate-y-0 [&:hover]:text-muted-foreground [&:hover]:bg-accent',
  statsItem: 'inline-flex items-center gap-1.25 text-xs leading-5 text-foreground-tertiary',
};

const filterItems = (items: ActionMenuItem[], keyword: string): ActionMenuItem[] => {
  const lower = keyword.toLowerCase();

  return items
    .map((item) => {
      if (!item) return null;

      if (item.type === 'group' && 'children' in item && item.children) {
        const filtered = item.children.filter((child) => {
          if (!child) return false;
          const key = String(child.key || '').toLowerCase();
          return key.includes(lower);
        });
        if (filtered.length === 0) return null;
        return { ...item, children: filtered };
      }

      if (item.type === 'divider') return item;

      const key = String('key' in item ? item.key : '').toLowerCase();
      return key.includes(lower) ? item : null;
    })
    .filter(Boolean) as ActionMenuItem[];
};

interface PopoverContentProps {
  autoCount: number;
  detailPopoverDisabled?: boolean;
  items: ActionMenuItem[];
  pinnedCount: number;
}

const PopoverContent = memo<PopoverContentProps>(
  ({ autoCount, detailPopoverDisabled, items, pinnedCount }) => {
    const { t } = useTranslation('setting');
    const navigate = useWorkspaceAwareNavigate();
    const [searchKeyword, setSearchKeyword] = useState('');

    const closePopover = usePopoverClose();

    const filteredItems = useMemo(
      () => (searchKeyword ? filterItems(items, searchKeyword) : items),
      [items, searchKeyword],
    );

    return (
      <div className="flex flex-col gap-0">
        <div className={cx('flex flex-row items-center gap-1', styles.header)}>
          <div className="flex flex-1 flex-row items-center gap-1.5 px-1.5">
            <span className="flex items-center text-foreground-tertiary">
              <Search size={14} />
            </span>
            <Input
              className="flex-1 border-0 px-0 text-sm leading-5.5 shadow-none focus-visible:border-transparent focus-visible:ring-0"
              placeholder={t('tools.search')}
              value={searchKeyword}
              visualSize="compact"
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Escape') event.stopPropagation();
              }}
            />
            {searchKeyword ? (
              <Button
                aria-label={t('tools.search')}
                className={styles.iconButton}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => setSearchKeyword('')}
              >
                <X className="size-3" size={12} />
              </Button>
            ) : null}
          </div>
          <SkillActivateMode />
        </div>
        <ScrollSignalProvider className="h-120 overflow-y-auto">
          <ToolsList detailPopoverDisabled={detailPopoverDisabled} items={filteredItems} />
        </ScrollSignalProvider>
        <div className={styles.footer}>
          <span className={styles.statsItem}>
            <span className="anticon" role="img">
              <Pin fill={'transparent'} height={12} size={12} width={12} />
            </span>
            {pinnedCount}
          </span>
          <span className={styles.statsItem}>
            <span className="anticon" role="img">
              <Zap fill={'transparent'} height={12} size={12} width={12} />
            </span>
            {autoCount}
          </span>
          <div className="flex flex-row items-center gap-0.5 ms-auto">
            <Button
              aria-label={t('tools.plugins.management')}
              className={styles.iconButton}
              size="icon"
              type="button"
              variant="ghost"
              onClick={() => {
                closePopover();
                navigate('/settings/connector');
              }}
            >
              <span className="anticon" role="img">
                <Settings
                  className="size-3.5"
                  fill={'transparent'}
                  height={14}
                  size={14}
                  width={14}
                />
              </span>
            </Button>
          </div>
        </div>
      </div>
    );
  },
);

PopoverContent.displayName = 'PopoverContent';

export default PopoverContent;
