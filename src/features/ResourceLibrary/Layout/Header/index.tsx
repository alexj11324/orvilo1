'use client';

import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';
import AddButton from '@/features/ResourceManager/components/Header/AddButton';

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
      {/*
        Search + create stay reachable from the sidebar no matter what the
        content area shows. The Explorer toolbar carries the same actions, but
        it is covered as soon as a page or file is opened, which left no way
        to add or find anything without backing out of the document first.

        This "+" sits beside the library name, so it creates at the library's
        root rather than in whatever folder the URL happens to be in; each
        folder row carries its own "+" for creating inside that folder.
      */}
      <div className="flex flex-row items-center gap-2 px-2" style={{ paddingBlock: '0 8px' }}>
        <LibrarySearchBar />
        <AddButton iconOnly rootLevel />
      </div>
    </>
  );
});

export default Header;
