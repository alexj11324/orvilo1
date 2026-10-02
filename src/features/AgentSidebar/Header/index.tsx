'use client';

import { type PropsWithChildren } from 'react';
import { memo } from 'react';

import SideBarHeaderLayout from '@/features/NavPanel/SideBarHeaderLayout';
import { useAgentStore } from '@/store/agent';

import Agent from './Agent';
import Nav from './Nav';

const HeaderInfo = memo<PropsWithChildren>(() => {
  const activeAgentId = useAgentStore((s) => s.activeAgentId);

  return (
    <>
      <SideBarHeaderLayout
        breadcrumb={[
          {
            href: activeAgentId ? `/agent/${activeAgentId}` : undefined,
            title: <Agent />,
          },
        ]}
      />
      <Nav />
    </>
  );
});

export default HeaderInfo;
