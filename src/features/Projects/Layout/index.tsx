'use client';

import { Flexbox } from '@lobehub/ui';
import { memo, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';

import ProjectDisabled from '@/features/Projects/ProjectDisabled';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/selectors';

import { projectPathSection } from './navigation';
import ProjectSidePanel from './ProjectSidePanel';
import { ProjectToolbarContext } from './ProjectToolbarContext';
import ProjectTabsBar from './TabsBar';

// The right-hand properties panel is a project-level surface in Linear — it
// persists across Overview / Activity / Issues — but would just eat space on
// Orvilo-only sub-pages like conversation and library.
const PANEL_SECTIONS = new Set(['overview', 'activity', 'tasks']);

// Below this width the panel is not just hidden but unmounted — its hooks
// drive several queries that should not run for a surface nobody can see.
const PANEL_MEDIA = '(width > 960px)';

const usePanelViewport = () => {
  const [visible, setVisible] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PANEL_MEDIA).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(PANEL_MEDIA);
    const onChange = () => setVisible(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return visible;
};

const ProjectLayout = memo(() => {
  const enabled = useUserStore(labPreferSelectors.enableProjects);
  const { projectId } = useActiveRouteParams<{ projectId: string }>();
  const { pathname } = useLocation();
  const panelViewport = usePanelViewport();
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const showPanel = panelViewport && PANEL_SECTIONS.has(projectPathSection(pathname) ?? '');

  if (!enabled) return <ProjectDisabled />;

  return (
    <ProjectToolbarContext value={toolbar}>
      <Flexbox height="100%" style={{ minWidth: 0 }}>
        <ProjectTabsBar toolbarRef={setToolbar} />
        <Flexbox horizontal flex={1} height="100%" style={{ minHeight: 0, minWidth: 0 }}>
          <Flexbox flex={1} height="100%" style={{ minHeight: 0, minWidth: 0 }}>
            <Outlet />
          </Flexbox>
          {showPanel && projectId && <ProjectSidePanel projectId={projectId} />}
        </Flexbox>
      </Flexbox>
    </ProjectToolbarContext>
  );
});

ProjectLayout.displayName = 'ProjectLayout';

export default ProjectLayout;
