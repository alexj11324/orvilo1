'use client';

import { Flexbox } from '@lobehub/ui';
import { TabsIndicator, TabsList, TabsRoot, TabsTab } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import NavHeader from '@/features/NavHeader';
import {
  SidebarHeaderSelectPopover,
  SidebarHeaderSelectTrigger,
} from '@/features/NavPanel/SidebarHeaderSelect';
import type { SwitcherItem } from '@/features/NavPanel/switcher/switcherItems';
import SwitcherMenu from '@/features/NavPanel/switcher/SwitcherMenu';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useCurrentProjectDetail, useCurrentProjectList, useProjectStore } from '@/store/project';

import {
  getProjectGoalsPath,
  getProjectOverviewPath,
  getProjectResourcesPath,
  getProjectTasksPath,
} from './navigation';

const styles = createStaticStyles(({ css, cssVar }) => ({
  tabsRow: css`
    flex: none;
    padding-inline: 20px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
}));

// Linear shape: project navigation is a tab strip in the content header, not a
// second left rail — the workspace nav panel is the only rail on /project/*.
const ProjectTabsBar = memo(() => {
  const { t } = useTranslation(['project', 'common']);
  const { projectId } = useActiveRouteParams<{ projectId: string }>();
  const navigate = useWorkspaceAwareNavigate();
  const { pathname } = useLocation();
  const detail = useCurrentProjectDetail(projectId);
  const projects = useCurrentProjectList();
  const { error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectList)(true);

  const projectReference = detail?.project.slug ?? projectId ?? '';

  const items = useMemo<SwitcherItem[]>(
    () =>
      projects.map((item) => ({
        avatar: item.avatar || item.name,
        id: item.slug ?? item.id,
        private: item.visibility === 'private',
        title: item.name,
      })),
    [projects],
  );

  const handleSelect = useCallback(
    (projectSlug: string) => navigate(`/project/${projectSlug}`),
    [navigate],
  );

  const tabs = useMemo(
    () => [
      { label: t('sections.overview'), path: getProjectOverviewPath(projectReference) },
      { label: t('sections.tasks'), path: getProjectTasksPath(projectReference) },
      { label: t('sections.goals'), path: getProjectGoalsPath(projectReference) },
      { label: t('resources.title'), path: getProjectResourcesPath(projectReference) },
    ],
    [projectReference, t],
  );

  const activeTab = tabs.find((tab) => pathname === tab.path)?.path ?? '';

  return (
    <>
      <NavHeader
        left={
          <SidebarHeaderSelectPopover
            content={
              <SwitcherMenu
                activeId={detail?.project.slug ?? detail?.project.id}
                error={error}
                isLoading={isLoading && items.length === 0}
                items={items}
                kind={'project'}
                searchPlaceholder={t('navPanel.searchProject', { ns: 'common' })}
                onRetry={() => mutate()}
                onSelect={handleSelect}
              />
            }
          >
            <SidebarHeaderSelectTrigger
              avatar={detail?.project.avatar || detail?.project.name || t('sidebar.title')}
              name={detail?.project.name || t('sidebar.title')}
              title={detail?.project.name || t('sidebar.title')}
            />
          </SidebarHeaderSelectPopover>
        }
        right={
          detail?.project.id ? (
            <WorkFavoriteButton targetId={detail.project.id} targetType="project" variant="icon" />
          ) : undefined
        }
      />
      <Flexbox className={styles.tabsRow}>
        <TabsRoot value={activeTab} onValueChange={(path) => navigate(path)}>
          <TabsList>
            <TabsIndicator />
            {tabs.map((tab) => (
              <TabsTab key={tab.path} value={tab.path}>
                {tab.label}
              </TabsTab>
            ))}
          </TabsList>
        </TabsRoot>
      </Flexbox>
    </>
  );
});

ProjectTabsBar.displayName = 'ProjectTabsBar';

export default ProjectTabsBar;
