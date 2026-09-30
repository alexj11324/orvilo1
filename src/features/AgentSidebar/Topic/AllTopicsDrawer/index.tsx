'use client';

import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import SearchBar from '@/components/SearchBar';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import SideBarDrawer from '@/features/NavPanel/SideBarDrawer';
import dynamic from '@/libs/next/dynamic';

const Content = dynamic(() => import('./Content'), {
  loading: () => (
    <div className="flex flex-col gap-[1px]" style={{ paddingBlock: 1, paddingInline: 4 }}>
      <SkeletonList rows={3} />
    </div>
  ),
  ssr: false,
});

interface AllTopicsDrawerProps {
  onClose: () => void;
  open: boolean;
}

const AllTopicsDrawer = memo<AllTopicsDrawerProps>(({ open, onClose }) => {
  const { t } = useTranslation('topic');
  const [searchKeyword, setSearchKeyword] = useState('');

  return (
    <SideBarDrawer
      open={open}
      title={t('title')}
      subHeader={
        <div className="flex flex-col" style={{ paddingBlock: '0 8px', paddingInline: 8 }}>
          <SearchBar
            defaultValue={searchKeyword}
            placeholder={t('searchPlaceholder')}
            onSearch={(keyword) => setSearchKeyword(keyword)}
            onChange={(e) => {
              if (!e.target.value) setSearchKeyword('');
            }}
          />
        </div>
      }
      onClose={onClose}
    >
      <Content open={open} searchKeyword={searchKeyword} />
    </SideBarDrawer>
  );
});

AllTopicsDrawer.displayName = 'AllTopicsDrawer';

export default AllTopicsDrawer;
