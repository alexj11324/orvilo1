'use client';

import { SearchIcon, XIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import SideBarDrawer from '@/features/NavPanel/SideBarDrawer';
import { useCacheScope } from '@/libs/swr/useCacheScope';
import { omitPersonalTeamItems } from '@/services/recent';
import { useHomeStore } from '@/store/home';
import { homeRecentSelectors } from '@/store/home/selectors';
import { createRecentQueryKey } from '@/store/home/slices/recent/initialState';

import ConnectedItem from './ConnectedItem';

interface AllRecentsDrawerProps {
  onClose: () => void;
  open: boolean;
}

const AllRecentsDrawer = memo<AllRecentsDrawerProps>(({ open, onClose }) => {
  const { t } = useTranslation('common');
  const [searchKeyword, setSearchKeyword] = useState('');
  const scope = useCacheScope();
  const workspaceId = useActiveWorkspaceId();
  const useFetchAllRecents = useHomeStore((s) => s.useFetchAllRecents);
  const queryKey = createRecentQueryKey(50);
  const query = useHomeStore(homeRecentSelectors.query(scope, queryKey));
  const items = query?.items;

  const { isLoading } = useFetchAllRecents(open, scope);

  const filteredItems = useMemo(() => {
    const visible = omitPersonalTeamItems(items ?? [], workspaceId);
    const keyword = searchKeyword.trim().toLowerCase();
    if (!keyword) return visible;
    return visible.filter((item) => item.title.toLowerCase().includes(keyword));
  }, [items, searchKeyword, workspaceId]);

  return (
    <SideBarDrawer
      open={open}
      title={t('recents')}
      subHeader={
        <div className="flex flex-col px-2" style={{ paddingBlock: '0 8px' }}>
          <div className="relative">
            <SearchIcon
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              size={14}
            />
            <Input
              className="h-7 pl-8"
              placeholder={t('navPanel.searchRecent')}
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
            />
            {searchKeyword && (
              <button
                aria-label={t('navPanel.searchRecent')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                onClick={() => setSearchKeyword('')}
              >
                <XIcon size={12} />
              </button>
            )}
          </div>
        </div>
      }
      onClose={onClose}
    >
      <div className="flex flex-col gap-[1px] py-[1px] px-1">
        {isLoading && !query ? (
          <SkeletonList rows={5} />
        ) : filteredItems.length === 0 && searchKeyword.trim() ? (
          <Empty style={{ paddingBlock: 24 }}>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <SearchIcon />
              </EmptyMedia>
              <EmptyDescription>{t('navPanel.searchResultEmpty')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          filteredItems.map((item) => {
            const itemRef = `${item.type}:${item.id}` as const;
            return (
              <ConnectedItem itemRef={itemRef} key={itemRef} queryKey={queryKey} scope={scope} />
            );
          })
        )}
      </div>
    </SideBarDrawer>
  );
});

AllRecentsDrawer.displayName = 'AllRecentsDrawer';

export default AllRecentsDrawer;
