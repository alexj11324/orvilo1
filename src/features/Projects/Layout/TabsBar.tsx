'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { TabsIndicator, TabsList, TabsRoot, TabsTab, Tag } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { memo, type Ref, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import Avatar from '@/components/Avatar';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import NavHeader from '@/features/NavHeader';
import {
  SidebarHeaderSelectPopover,
  SidebarHeaderSelectTrigger,
} from '@/features/NavPanel/SidebarHeaderSelect';
import type { SwitcherItem } from '@/features/NavPanel/switcher/switcherItems';
import SwitcherMenu from '@/features/NavPanel/switcher/SwitcherMenu';
import { PROJECT_STATUS_META } from '@/features/Projects/Workspace/ProjectPropertiesCard';
import { useProjectMembersQuery } from '@/features/Teammates/api/hooks';
import { useTeammatesEnabled } from '@/features/Teammates/useTeammatesEnabled';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useCurrentProjectDetail, useCurrentProjectList, useProjectStore } from '@/store/project';

import {
  getProjectActivityPath,
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
    padding-inline: 20px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
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

  // Linear's project header is exactly Overview | Activity | Issues — goals
  // and resources live as sections on the Overview body instead of tabs.
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
    ],
    [projectReference, t],
  );

  const activeTab = tabs.find((tab) => projectPathSection(pathname) === tab.section)?.path ?? '';

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
            <Flexbox horizontal align={'center'} gap={10}>
              <Tag
                color={PROJECT_STATUS_META[detail.project.status]?.color}
                shape={'round'}
                size={'small'}
                icon={
                  <Icon
                    size={12}
                    icon={
                      (PROJECT_STATUS_META[detail.project.status] ?? PROJECT_STATUS_META.backlog)
                        .icon
                    }
                  />
                }
              >
                {t(`acceptance.status.${detail.project.status}`, {
                  defaultValue: detail.project.status,
                })}
              </Tag>
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
            </Flexbox>
          ) : undefined
        }
      />
      <Flexbox horizontal align={'center'} className={styles.tabsRow} justify={'space-between'}>
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
        <div ref={toolbarRef} />
      </Flexbox>
    </>
  );
});

ProjectTabsBar.displayName = 'ProjectTabsBar';

export default ProjectTabsBar;
