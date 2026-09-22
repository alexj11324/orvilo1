'use client';

import '@/assets/fonts/inter/standard.css';
import '@/assets/fonts/inter/standard-italic.css';

import { Flexbox } from '@lobehub/ui';
import { ConfigProvider } from 'antd';
import { memo, useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router';

import { genFontFamily } from '@/const/font';
import ProjectDisabled from '@/features/Projects/ProjectDisabled';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { resolveUILocale } from '@/libs/getUILocaleAndResources.utils';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useUserStore } from '@/store/user';
import { labPreferSelectors, preferenceSelectors } from '@/store/user/selectors';

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

// Keep the OFL notice in both Web and Electron renderer asset graphs.
const interLicenseUrl = new URL('../../../assets/fonts/inter/LICENSE.txt', import.meta.url).href;

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
  const userFontFamily = useUserStore(preferenceSelectors.fontFamily);
  const language = useGlobalStore(systemStatusSelectors.language);
  const fontFamily = genFontFamily({
    customFontFamily: 'Inter Variable',
    locale: resolveUILocale(language).normalizedLocale,
    userFontFamily,
  });
  const { projectId } = useActiveRouteParams<{ projectId: string }>();
  const { pathname } = useLocation();
  const panelViewport = usePanelViewport();
  const [toolbar, setToolbar] = useState<HTMLDivElement | null>(null);
  const showPanel = panelViewport && PANEL_SECTIONS.has(projectPathSection(pathname) ?? '');

  if (!enabled) return <ProjectDisabled />;

  return (
    <ConfigProvider theme={{ token: { fontFamily } }}>
      <link href={interLicenseUrl} rel="license" title="Inter font license" />
      <ProjectToolbarContext value={toolbar}>
        <Flexbox height="100%" style={{ fontFamily, fontFeatureSettings: 'normal', minWidth: 0 }}>
          <ProjectTabsBar toolbarRef={setToolbar} />
          <Flexbox horizontal flex={1} height="100%" style={{ minHeight: 0, minWidth: 0 }}>
            <Flexbox flex={1} height="100%" style={{ minHeight: 0, minWidth: 0 }}>
              <Outlet />
            </Flexbox>
            {showPanel && projectId && (
              <ProjectSidePanel
                projectId={projectId}
                showActivity={projectPathSection(pathname) === 'overview'}
              />
            )}
          </Flexbox>
        </Flexbox>
      </ProjectToolbarContext>
    </ConfigProvider>
  );
});

ProjectLayout.displayName = 'ProjectLayout';

export default ProjectLayout;
