'use client';

import { type PropsWithChildren } from 'react';
import { memo } from 'react';

import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';

import Agent from './Agent';
import Nav from './Nav';

const HeaderInfo = memo<PropsWithChildren>(() => {
  const { gid } = useActiveRouteParams<{ gid: string }>();

  return (
    <>
      <SideBarHeaderLayout
        breadcrumb={[
          {
            href: gid ? `/group/${gid}` : undefined,
            title: <Agent />,
          },
        ]}
      />
      <Nav />
    </>
  );
});

export default HeaderInfo;
