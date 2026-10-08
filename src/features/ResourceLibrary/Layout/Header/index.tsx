'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';

import LibraryHead from './LibraryHead';
import LibrarySearchBar from './LibrarySearchBar';
import { useActiveLibraryId } from './useActiveLibraryId';

const Header = memo(() => {
  const id = useActiveLibraryId();
  const { t } = useTranslation('common');
  return (
    <>
      <SideBarHeaderLayout
        backTo="/resource"
        left={<LibraryHead id={id} />}
        breadcrumb={[
          {
            href: `/resource/library/${id}`,
            title: t('tab.resource'),
          },
        ]}
      />
      <div className="flex flex-row items-center gap-2 px-2" style={{ paddingBlock: '0 8px' }}>
        <LibrarySearchBar />
      </div>
    </>
  );
});

export default Header;
