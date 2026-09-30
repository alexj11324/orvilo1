'use client';

import type { NavigationFavorite, NavigationFavoriteTargetType } from '@orvilo/types';
import { SearchIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import { SidebarMenu, SidebarProvider } from '@/components/ui/sidebar';
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
          <div className="px-2 pb-2">
            <Input
              aria-label={t('navPanel.searchFavorites')}
              placeholder={t('navPanel.searchFavorites')}
              type="search"
              value={searchKeyword}
              onChange={(event) => setSearchKeyword(event.target.value)}
            />
          </div>
        }
        onClose={onClose}
      >
        <SidebarProvider open style={{ display: 'contents' }}>
          <div className="px-1 py-1">
            {filteredItems.length === 0 && isSearching ? (
              <div className="flex flex-col items-center gap-2 py-6 text-sm text-muted-foreground">
                <SearchIcon aria-hidden />
                <p>{t('navPanel.searchResultEmpty')}</p>
              </div>
            ) : (
              <SidebarMenu className="gap-0.25">
                {filteredItems.map((item) => {
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
                })}
              </SidebarMenu>
            )}
          </div>
        </SidebarProvider>
      </SideBarDrawer>
    );
  },
);

AllFavoritesDrawer.displayName = 'AllFavoritesDrawer';

export default AllFavoritesDrawer;
