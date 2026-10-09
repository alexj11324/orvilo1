'use client';
import { createStaticStyles } from 'antd-style';
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

const styles = createStaticStyles(({ css, cssVar }) => ({
  headerMembers: css`
    display: flex;
    align-items: center;

    > * {
      margin-inline-start: -6px;
      border: 2px solid ${cssVar.colorBgContainer};
      border-radius: 50%;

      &:first-child {
        margin-inline-start: 0;
      }
    }
  `,
  tabsRow: css`
    flex: none;
    min-height: 40px;
    padding-inline: 20px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  navigationLink: css`
    display: inline-flex;
    flex: none;
    align-items: center;

    height: 28px;
    padding-inline: 10px;
    border-radius: 9999px;

    font-size: 12px;
    font-weight: 500;
    line-height: normal;
    color: ${cssVar.colorTextSecondary};
    text-decoration: none;

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillTertiary};
    }

    &[aria-current='page'] {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }

    &:focus-visible {
      outline: 2px solid ${cssVar.colorPrimary};
      outline-offset: 2px;
    }
  `,
}));

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
            <div className="flex flex-row" style={{ alignItems: 'center', gap: 10 }}>
              {/* The glyph carries the status colour; the label stays foreground, since the
                  status fill colours are not text-safe on light (amber 2.2:1). */}
              <Badge className="text-xs text-foreground" radius="full" size="sm" variant="outline">
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
      <div
        className={cn('flex flex-row', styles.tabsRow)}
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div className="flex flex-row" style={{ gap: 4 }}>
          {tabs.map((tab) => (
            <WorkspaceLink
              aria-current={activeTab === tab.path ? 'page' : undefined}
              className={styles.navigationLink}
              key={tab.path}
              to={tab.path}
            >
              {tab.label}
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
