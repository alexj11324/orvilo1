'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';
import { Outlet } from 'react-router';

import ProjectDisabled from '@/features/Projects/ProjectDisabled';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/selectors';

import ProjectTabsBar from './TabsBar';

const ProjectLayout = memo(() => {
  const enabled = useUserStore(labPreferSelectors.enableProjects);

  if (!enabled) return <ProjectDisabled />;

  return (
    <Flexbox height="100%" style={{ minWidth: 0 }}>
      <ProjectTabsBar />
      <Flexbox flex={1} height="100%" style={{ minHeight: 0, minWidth: 0 }}>
        <Outlet />
      </Flexbox>
    </Flexbox>
  );
});

ProjectLayout.displayName = 'ProjectLayout';

export default ProjectLayout;
