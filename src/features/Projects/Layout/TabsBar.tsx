'use client';
import { cn } from 'cn';
import { memo, type Ref, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import Avatar from '@/components/Avatar';
import { Badge } from '@/components/reui/badge';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import NavHeader from '@/features/NavHeader';
import {
  SidebarHeaderSelectPopover,
  SidebarHeaderSelectTrigger,
} from '@/features/NavPanel/SidebarHeaderSelect';
import type { SwitcherItem } from '@/features/NavPanel/switcher/switcherItems';
import SwitcherMenu from '@/features/NavPanel/switcher/SwitcherMenu';
import { ProjectStatusIcon } from '@/features/Projects/ProjectStatusIcon';
import { useProjectMembersQuery } from '@/features/Teammates/api/hooks';
import { useTeammatesEnabled } from '@/features/Teammates/useTeammatesEnabled';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useCurrentProjectDetail, useCurrentProjectList, useProjectStore } from '@/store/project';

import {
  getProjectActivityPath,
  getProjectMilestonesPath,
  getProjectOverviewPath,
  getProjectTasksPath,
  projectPathSection,
} from './navigation';

const styles = {
  headerMembers:
    'flex items-center [&>*]:-ms-1.5 [&>*]:rounded-full [&>*]:border-2 [&>*]:border-card [&>*:first-child]:ms-0',
  tabsRow: 'min-h-10 flex-none border-be border-divider px-5',
  navigationLink:
    'inline-flex h-8 flex-none items-center rounded-(--radius-button) px-2.5 text-sm leading-5.5 font-medium text-muted-foreground no-underline group-hover/project-tab:bg-accent group-hover/project-tab:text-foreground group-aria-[current=page]/project-tab:bg-selected group-aria-[current=page]/project-tab:text-foreground group-focus-visible/project-tab:bg-accent group-focus-visible/project-tab:text-foreground',
};

// Linear shape: project navigation is a tab strip in the content header, not a
// second left rail — the workspace nav panel is the only rail on /project/*.
const ProjectTabsBar = memo(({ toolbarRef }: { toolbarRef?: Ref<HTMLDivElement> }) => {
  const { t } = useTranslation(['project', 'common']);
  const { projectId } = useActiveRouteParams<{ projectId: string }>();
  const navigate = useWorkspaceAwareNavigate();
  const { pathname } = useLocation();
  const detail = useCurrentProjectDetail(projectId);
  const projects = useCurrentProjectList();
  const { error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectList)(true);
  const workspaceId = useActiveWorkspaceId();
  const membersEnabled = useTeammatesEnabled() && !!workspaceId;
  const membersSWR = useProjectMembersQuery(detail?.project.id, membersEnabled);

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

  // Linear's project header is Overview | Activity | Issues | Milestones —
  // goals and resources live as sections on the Overview body instead of tabs.
  const tabs = useMemo(
    () => [
      {
        label: t('sections.overview'),
        path: getProjectOverviewPath(projectReference),
        section: 'overview',
      },
      {
        label: t('sections.activity'),
        path: getProjectActivityPath(projectReference),
        section: 'activity',
      },
      {
        label: t('sections.issues'),
        path: getProjectTasksPath(projectReference),
        section: 'tasks',
      },
      {
        label: t('sections.milestones'),
        path: getProjectMilestonesPath(projectReference),
        section: 'milestones',
      },
    ],
    [projectReference, t],
  );

  const activeTab = tabs.find((tab) => projectPathSection(pathname) === tab.section)?.path ?? '';

  return (
    <>
      <NavHeader
        left={
          <SidebarHeaderSelectPopover
            content={(closePopover) => (
              <SwitcherMenu
                activeId={detail?.project.slug ?? detail?.project.id}
                closePopover={closePopover}
                error={error}
                isLoading={isLoading && items.length === 0}
                items={items}
                kind={'project'}
                searchPlaceholder={t('navPanel.searchProject', { ns: 'common' })}
                onRetry={() => mutate()}
                onSelect={handleSelect}
              />
            )}
          >
            <SidebarHeaderSelectTrigger
              avatar={detail?.project.avatar || undefined}
              name={detail?.project.name || t('sidebar.title')}
              title={detail?.project.name || t('sidebar.title')}
            />
          </SidebarHeaderSelectPopover>
        }
        right={
          detail?.project.id ? (
            <div className="flex flex-row items-center gap-2.5">
              {/* The glyph carries the status colour; the label stays foreground, since the
                  status fill colours are not text-safe on light (amber 2.2:1). */}
              <Badge
                className="h-auto text-xs leading-5 text-foreground"
                radius="full"
                size="default"
                variant="outline"
              >
                <ProjectStatusIcon size={16} status={detail.project.status} />
                {t(`status.${detail.project.status}`, {
                  defaultValue: detail.project.status,
                })}
              </Badge>
              {membersEnabled && (membersSWR.data?.length ?? 0) > 0 && (
                <div className={styles.headerMembers}>
                  {membersSWR.data!.slice(0, 4).map((member) => (
                    <Avatar
                      avatar={member.user?.avatar ?? undefined}
                      key={member.userId}
                      size={20}
                      title={member.user?.fullName || member.user?.username || undefined}
                    />
                  ))}
                </div>
              )}
              <WorkFavoriteButton
                targetId={detail.project.id}
                targetType="project"
                variant="icon"
              />
            </div>
          ) : undefined
        }
      />
      <div className={cn(cn('flex flex-row', styles.tabsRow), 'items-center justify-between')}>
        <div className="flex flex-row gap-1">
          {tabs.map((tab) => (
            <WorkspaceLink
              aria-current={activeTab === tab.path ? 'page' : undefined}
              className="group/project-tab inline-flex flex-none rounded-(--radius-button) focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
              key={tab.path}
              to={tab.path}
            >
              <span className={styles.navigationLink}>{tab.label}</span>
            </WorkspaceLink>
          ))}
        </div>
        <div ref={toolbarRef} />
      </div>
    </>
  );
});

ProjectTabsBar.displayName = 'ProjectTabsBar';

export default ProjectTabsBar;
