'use client';

import { memo } from 'react';

import { Accordion } from '@/components/ui/accordion';
import SideBarLayout from '@/features/NavPanel/SideBarLayout';

import SidebarBody from './Body';
import Header from './Header';

export enum GroupKey {
  Library = 'library',
}

const ResourceSidebarContent = memo(() => (
  <SideBarLayout
    header={<Header />}
    body={
      <div className="flex flex-col py-2 px-1">
        <Accordion defaultValue={[GroupKey.Library]} style={{ gap: 8 }}>
          <SidebarBody itemKey={GroupKey.Library} />
        </Accordion>
      </div>
    }
  />
));

ResourceSidebarContent.displayName = 'ResourceSidebarContent';

export default ResourceSidebarContent;
