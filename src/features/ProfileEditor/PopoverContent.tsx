import { clsx as cx } from 'cn';
import { ExternalLink, Settings } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ItemType } from '@/components/Menu';
import SearchBar from '@/components/SearchBar';
import { ScrollSignalProvider } from '@/features/ChatInput/ActionBar/Tools/ScrollSignalContext';
import ToolsList, { toolsListStyles } from '@/features/ChatInput/ActionBar/Tools/ToolsList';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import Empty from './Empty';

const SKILL_ICON_SIZE = 16;

const filterItems = (items: ItemType[], keyword: string): ItemType[] => {
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
    .filter(Boolean) as ItemType[];
};

const styles = {
  header: 'border-be border-divider bg-transparent p-2',
};

const twStyles = {
  footer: 'border-bs border-divider p-1',
  scroller: 'overflow-x-hidden overflow-y-auto',
  trailingIcon: 'opacity-50',
};

interface PopoverContentProps {
  items: ItemType[];
  onClose?: () => void;
}

const PopoverContent = memo<PopoverContentProps>(({ items, onClose }) => {
  const { t } = useTranslation('setting');
  const navigate = useWorkspaceAwareNavigate();
  const [searchKeyword, setSearchKeyword] = useState('');

  const filteredItems = useMemo(
    () => (searchKeyword ? filterItems(items, searchKeyword) : items),
    [items, searchKeyword],
  );

  const isEmpty = filteredItems.length === 0;

  return (
    <div className="flex flex-col" style={{ maxHeight: 500, width: '100%' }}>
      <div className={styles.header} onClick={(event) => event.stopPropagation()}>
        <SearchBar
          placeholder={t('tools.search')}
          style={{ flex: 1 }}
          value={searchKeyword}
          onChange={(e) => setSearchKeyword(e.target.value)}
          onKeyDown={(event) => event.stopPropagation()}
        />
      </div>
      <ScrollSignalProvider className={twStyles.scroller} style={{ flex: 1 }}>
        {isEmpty ? <Empty /> : <ToolsList items={filteredItems} />}
      </ScrollSignalProvider>
      <div className={twStyles.footer}>
        <div
          className={toolsListStyles.item}
          role="button"
          tabIndex={0}
          onClick={() => {
            onClose?.();
            navigate('/settings/connector');
          }}
        >
          <div className={toolsListStyles.itemIcon}>
            <span className="anticon" role="img">
              <Settings
                fill={'transparent'}
                height={SKILL_ICON_SIZE}
                size={SKILL_ICON_SIZE}
                width={SKILL_ICON_SIZE}
              />
            </span>
          </div>
          <div className={toolsListStyles.itemContent}>{t('tools.plugins.management')}</div>
          <span className={cx('anticon', twStyles.trailingIcon)} role="img">
            <ExternalLink fill={'transparent'} height={16} size={16} width={16} />
          </span>
        </div>
      </div>
    </div>
  );
});

PopoverContent.displayName = 'PopoverContent';

export default PopoverContent;
