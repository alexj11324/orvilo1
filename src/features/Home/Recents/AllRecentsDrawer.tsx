'use client';

import { Empty, Flexbox, SearchBar } from '@lobehub/ui';
import { SearchIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
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
        <Flexbox paddingBlock={'0 8px'} paddingInline={8}>
          <SearchBar
            allowClear
            defaultValue={searchKeyword}
            placeholder={t('navPanel.searchRecent')}
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
        {isLoading && !query ? (
          <SkeletonList rows={5} />
        ) : filteredItems.length === 0 && searchKeyword.trim() ? (
          <Empty
            description={t('navPanel.searchResultEmpty')}
            icon={SearchIcon}
            style={{ paddingBlock: 24 }}
          />
        ) : (
          filteredItems.map((item) => {
            const itemRef = `${item.type}:${item.id}` as const;
            return (
              <ConnectedItem itemRef={itemRef} key={itemRef} queryKey={queryKey} scope={scope} />
            );
          })
        )}
      </Flexbox>
    </SideBarDrawer>
  );
});

AllRecentsDrawer.displayName = 'AllRecentsDrawer';

export default AllRecentsDrawer;
