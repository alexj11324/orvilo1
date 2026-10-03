'use client';

import { type PropsWithChildren } from 'react';
import { memo } from 'react';

import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';

import Agent from './Agent';
import Nav from './Nav';

const HeaderInfo = memo<PropsWithChildren>(() => {
  return (
    <>
      <SideBarHeaderLayout
        breadcrumb={[
          {
            // Static context label — plain muted text, not a link back to the
            // page you're already on.
            title: <Agent />,
          },
        ]}
      />
      <Nav />
    </>
  );
});

export default HeaderInfo;
