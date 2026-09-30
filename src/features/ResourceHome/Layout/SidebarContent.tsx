'use client';

import { AccordionRoot } from '@lobehub/ui/base-ui';
import { memo } from 'react';

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
        <AccordionRoot
          defaultValue={[GroupKey.Library]}
          indicatorPlacement="inline"
          style={{ gap: 8 }}
        >
          <SidebarBody itemKey={GroupKey.Library} />
        </AccordionRoot>
      </div>
    }
  />
));

ResourceSidebarContent.displayName = 'ResourceSidebarContent';

export default ResourceSidebarContent;
