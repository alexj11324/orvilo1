'use client';

import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Input } from '@/components/ui/input';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import SideBarDrawer from '@/features/NavPanel/SideBarDrawer';
import dynamic from '@/libs/next/dynamic';

const Content = dynamic(() => import('./Content'), {
  loading: () => (
    <div className="flex flex-col gap-px py-px px-1">
      <SkeletonList rows={3} />
    </div>
  ),
  ssr: false,
});

interface AllAgentsDrawerProps {
  onClose: () => void;
  open: boolean;
}

const AllAgentsDrawer = memo<AllAgentsDrawerProps>(({ open, onClose }) => {
  const { t } = useTranslation('common');
  const [searchKeyword, setSearchKeyword] = useState('');

  return (
    <SideBarDrawer
      open={open}
      title={t('navPanel.agent')}
      subHeader={
        <div className="flex flex-col px-2 pb-2">
          <Input
            aria-label={t('navPanel.searchAgent')}
            placeholder={t('navPanel.searchAgent')}
            type="search"
            value={searchKeyword}
            visualSize="compact"
            onChange={(event) => setSearchKeyword(event.target.value)}
          />
        </div>
      }
      onClose={onClose}
    >
      <Content open={open} searchKeyword={searchKeyword} />
    </SideBarDrawer>
  );
});

AllAgentsDrawer.displayName = 'AllAgentsDrawer';

export default AllAgentsDrawer;
