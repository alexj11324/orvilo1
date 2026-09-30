'use client';

import { SearchIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
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
          <div className="relative">
            <SearchIcon className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              className="pl-8"
              defaultValue={searchKeyword}
              placeholder={t('searchPlaceholder')}
              onChange={(e) => {
                const keyword = e.target.value;
                setSearchKeyword(keyword);
              }}
            />
          </div>
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
