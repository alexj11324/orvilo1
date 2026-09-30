import { createStaticStyles, cssVar, cx } from 'antd-style';
import { Pin, Search, Settings, X, Zap } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import type { ActionMenuItem } from '../../menuItems';
import { usePopoverClose } from '../components/ActionPopover';
import { ScrollSignalProvider } from './ScrollSignalContext';
import SkillActivateMode from './SkillActivateMode';
import ToolsList from './ToolsList';

const styles = createStaticStyles(({ css }) => ({
  footer: css`
    display: flex;
    gap: 14px;
    align-items: center;

    padding-block: 6px;
    padding-inline: 12px;
    border-block-start: 1px solid ${cssVar.colorFill};
  `,
  header: css`
    padding-block: 8px;
    padding-inline: 8px;
    border-block-end: 1px solid ${cssVar.colorFill};
  `,
  iconButton: css`
    cursor: pointer;

    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;

    width: 28px;
    height: 28px;
    border: 0;
    border-radius: 6px;

    color: ${cssVar.colorTextTertiary};

    background: transparent;

    transition:
      color 0.2s,
      background 0.2s;

    &:hover {
      color: ${cssVar.colorTextSecondary};
      background: ${cssVar.colorFillTertiary};
    }
  `,
  statsItem: css`
    display: inline-flex;
    gap: 5px;
    align-items: center;

    font-size: 12px;
    line-height: 18px;
    color: ${cssVar.colorTextTertiary};
  `,
}));

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
            <span className="flex items-center" style={{ color: cssVar.colorTextTertiary }}>
              <Search size={14} />
            </span>
            <Input
              className="h-7 flex-1 border-0 px-0 shadow-none focus-visible:border-transparent focus-visible:ring-0"
              placeholder={t('tools.search')}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
            />
            {searchKeyword ? (
              <button
                aria-label={t('tools.search')}
                className={styles.iconButton}
                type="button"
                onClick={() => setSearchKeyword('')}
              >
                <X size={12} />
              </button>
            ) : null}
          </div>
          <SkillActivateMode />
        </div>
        <ScrollSignalProvider
          style={{
            height: 480,
            overflowY: 'auto',
          }}
        >
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
          <div className="flex flex-row items-center gap-0.5" style={{ marginInlineStart: 'auto' }}>
            <button
              aria-label={t('tools.plugins.management')}
              className={styles.iconButton}
              type="button"
              onClick={() => {
                closePopover();
                navigate('/settings/connector');
              }}
            >
              <span className="anticon" role="img">
                <Settings fill={'transparent'} height={14} size={14} width={14} />
              </span>
            </button>
          </div>
        </div>
      </div>
    );
  },
);

PopoverContent.displayName = 'PopoverContent';

export default PopoverContent;
