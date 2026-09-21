'use client';

import { Flexbox } from '@lobehub/ui';
import { memo } from 'react';
import { Outlet, useLocation } from 'react-router';

import ProjectDisabled from '@/features/Projects/ProjectDisabled';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/selectors';

import { projectPathSection } from './navigation';
import ProjectSidePanel from './ProjectSidePanel';
import ProjectTabsBar from './TabsBar';

// The right-hand properties panel is a project-level surface in Linear — it
// persists across Overview / Activity / Issues — but would just eat space on
// Orvilo-only sub-pages like conversation and library.
const PANEL_SECTIONS = new Set(['overview', 'activity', 'tasks']);

const ProjectLayout = memo(() => {
  const enabled = useUserStore(labPreferSelectors.enableProjects);
  const { projectId } = useActiveRouteParams<{ projectId: string }>();
  const { pathname } = useLocation();
  const showPanel = PANEL_SECTIONS.has(projectPathSection(pathname) ?? '');

  if (!enabled) return <ProjectDisabled />;

  return (
    <Flexbox height="100%" style={{ minWidth: 0 }}>
      <ProjectTabsBar />
      <Flexbox horizontal flex={1} height="100%" style={{ minHeight: 0, minWidth: 0 }}>
        <Flexbox flex={1} height="100%" style={{ minHeight: 0, minWidth: 0 }}>
          <Outlet />
        </Flexbox>
        {showPanel && projectId && <ProjectSidePanel projectId={projectId} />}
      </Flexbox>
    </Flexbox>
  );
});

ProjectLayout.displayName = 'ProjectLayout';

export default ProjectLayout;
