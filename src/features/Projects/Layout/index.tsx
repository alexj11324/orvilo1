'use client';

import { memo, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';

import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';

import { projectPathSection } from './navigation';
import { ProjectPanelSuppressContext } from './ProjectPanelPeekContext';
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
  const { projectId } = useActiveRouteParams<{ projectId: string }>();
  const { pathname } = useLocation();
  const panelViewport = usePanelViewport();
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  // The Issues peek takes the panel's place while it is open.
  const [panelSuppressed, setPanelSuppressed] = useState(false);
  const showPanel = panelViewport && PANEL_SECTIONS.has(projectPathSection(pathname) ?? '');

  return (
    <ProjectToolbarContext value={toolbar}>
      <ProjectPanelSuppressContext value={setPanelSuppressed}>
        <div className="flex flex-col" style={{ height: '100%', minWidth: 0 }}>
          <ProjectTabsBar toolbarRef={setToolbar} />
          <div
            className="flex flex-row"
            style={{ flex: 1, height: '100%', minHeight: 0, minWidth: 0 }}
          >
            <div
              className="flex flex-col"
              style={{ flex: 1, height: '100%', minHeight: 0, minWidth: 0 }}
            >
              <Outlet />
            </div>
            {showPanel && projectId && (
              // `contents` keeps the panel as the flex child; `hidden` keeps it
              // mounted so its section toggles survive the peek.
              <div className={panelSuppressed ? 'hidden' : 'contents'}>
                <ProjectSidePanel
                  projectId={projectId}
                  showActivity={projectPathSection(pathname) === 'overview'}
                />
              </div>
            )}
          </div>
        </div>
      </ProjectPanelSuppressContext>
    </ProjectToolbarContext>
  );
});

ProjectLayout.displayName = 'ProjectLayout';

export default ProjectLayout;
