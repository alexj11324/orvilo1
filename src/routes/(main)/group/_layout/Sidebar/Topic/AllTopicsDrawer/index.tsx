'use client';

import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import SideBarDrawer from '@/features/NavPanel/SideBarDrawer';
import dynamic from '@/libs/next/dynamic';

const Content = dynamic(() => import('./Content'), {
  loading: () => (
    <div className="flex flex-col px-1" style={{ gap: 1, paddingBlock: 1 }}>
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
        <div className="flex flex-col px-2" style={{ paddingBlock: '0 8px' }}>
          <Input
            defaultValue={searchKeyword}
            placeholder={t('searchPlaceholder')}
            onChange={(e) => {
              const keyword = e.target.value;
              if (!keyword) setSearchKeyword('');
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setSearchKeyword(e.currentTarget.value);
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
