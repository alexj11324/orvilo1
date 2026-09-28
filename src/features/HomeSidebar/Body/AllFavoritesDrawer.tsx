'use client';

import { Empty, Flexbox, SearchBar } from '@lobehub/ui';
import type { NavigationFavorite, NavigationFavoriteTargetType } from '@orvilo/types';
import { SearchIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import SideBarDrawer from '@/features/NavPanel/SideBarDrawer';

import { favoriteLabel } from './favoriteLabel';
import { filterFavoritesByKeyword } from './favoriteOverflow';
import FavoriteRow from './FavoriteRow';

interface AllFavoritesDrawerProps {
  items: NavigationFavorite[];
  onClose: () => void;
  onMove: (index: number, direction: 'down' | 'up') => void;
  onUnpin: (targetId: string, targetType: NavigationFavoriteTargetType) => void;
  open: boolean;
}

const AllFavoritesDrawer = memo<AllFavoritesDrawerProps>(
  ({ items, open, onClose, onMove, onUnpin }) => {
    const { t } = useTranslation('common');
    const [searchKeyword, setSearchKeyword] = useState('');
    const isSearching = searchKeyword.trim().length > 0;

    const filteredItems = useMemo(
      () =>
        filterFavoritesByKeyword(items, searchKeyword, (item) =>
          favoriteLabel(item.targetType, item.title, t, item.targetId),
        ),
      [items, searchKeyword, t],
    );

    return (
      <SideBarDrawer
        open={open}
        title={t('tab.favorites')}
        width={320}
        subHeader={
          <Flexbox paddingBlock={'0 8px'} paddingInline={8}>
            <SearchBar
              allowClear
              defaultValue={searchKeyword}
              placeholder={t('navPanel.searchFavorites')}
              onSearch={(keyword) => setSearchKeyword(keyword)}
              onInputChange={(keyword) => {
                setSearchKeyword(keyword);
              }}
            />
          </Flexbox>
        }
        onClose={onClose}
      >
        <Flexbox gap={1} paddingBlock={1} paddingInline={4}>
          {filteredItems.length === 0 && isSearching ? (
            <Empty
              description={t('navPanel.searchResultEmpty')}
              icon={SearchIcon}
              style={{ paddingBlock: 24 }}
            />
          ) : (
            filteredItems.map((item) => {
              const index = items.indexOf(item);
              return (
                <FavoriteRow
                  index={index}
                  item={item}
                  itemCount={items.length}
                  key={`${item.targetType}:${item.targetId}`}
                  showReorder={!isSearching}
                  onMove={onMove}
                  onUnpin={onUnpin}
                />
              );
            })
          )}
        </Flexbox>
      </SideBarDrawer>
    );
  },
);

AllFavoritesDrawer.displayName = 'AllFavoritesDrawer';

export default AllFavoritesDrawer;
