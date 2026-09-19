'use client';

import { Flexbox } from '@lobehub/ui';
import { cssVar } from 'antd-style';
import { HouseIcon, LibraryBigIcon, ListTodoIcon, TargetIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import AsyncError from '@/components/AsyncError';
import NavItem from '@/features/NavPanel/components/NavItem';
import SideBarLayout from '@/features/NavPanel/SideBarLayout';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';

import {
  getProjectGoalsPath,
  getProjectOverviewPath,
  getProjectResourcesPath,
  getProjectTasksPath,
} from './navigation';
import ProjectHeader from './ProjectHeader';

const ProjectSidebarContent = memo(() => {
  const { t } = useTranslation('project');
  const { projectId } = useActiveRouteParams<{ projectId: string }>();
  const navigate = useWorkspaceAwareNavigate();
  const { pathname } = useLocation();
  const detail = useCurrentProjectDetail(projectId);
  const detailSWR = useProjectStore((s) => s.useFetchProjectDetail)(projectId);
  const projectOverviewPath = getProjectOverviewPath(projectId!);
  const projectTasksPath = getProjectTasksPath(projectId!);
  const projectGoalsPath = getProjectGoalsPath(projectId!);
  const projectResourcesPath = getProjectResourcesPath(projectId!);

  const header = <ProjectHeader project={detail?.project} />;

  if (detailSWR.error)
    return (
      <SideBarLayout
        body={<AsyncError error={detailSWR.error} variant="inline" onRetry={detailSWR.mutate} />}
        header={header}
        scrollKey="project"
      />
    );

  return (
    <SideBarLayout
      header={header}
      scrollKey="project"
      body={
        <Flexbox gap={8} paddingInline={4}>
          <NavItem
            active={pathname === projectOverviewPath}
            icon={HouseIcon}
            title={t('sections.home')}
            onClick={() => navigate(projectOverviewPath)}
          />
          <NavItem
            active={pathname === projectTasksPath}
            icon={ListTodoIcon}
            title={t('sections.tasks')}
            onClick={() => navigate(projectTasksPath)}
          />
          {/* Sits next to Tasks: a project's libraries are the context those
              tasks run against, not a separate product surface. */}
          <NavItem
            active={pathname === projectResourcesPath}
            icon={LibraryBigIcon}
            title={t('resources.title')}
            onClick={() => navigate(projectResourcesPath)}
          />
          <NavItem
            active={pathname === projectGoalsPath}
            icon={TargetIcon}
            title={t('sections.goals')}
            onClick={() => navigate(projectGoalsPath)}
          />
        </Flexbox>
      }
    />
  );
});

// The project rail renders inside the page surface — the workspace nav panel
// stays mounted on project routes, so this is a second, narrower in-surface
// rail rather than a nav-panel swap.
const ProjectSidebar = memo(() => {
  const { projectId } = useActiveRouteParams<{ projectId: string }>();
  const detail = useCurrentProjectDetail(projectId);

  return (
    <Flexbox
      aria-label={detail?.project.name}
      flex="none"
      role="navigation"
      style={{
        width: 208,
        borderInlineEnd: `1px solid ${cssVar.colorBorderSecondary}`,
        minHeight: 0,
      }}
    >
      <ProjectSidebarContent />
    </Flexbox>
  );
});

ProjectSidebar.displayName = 'ProjectSidebar';

export default ProjectSidebar;
