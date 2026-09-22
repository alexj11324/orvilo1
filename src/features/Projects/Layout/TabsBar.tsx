'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Tag } from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { memo, type Ref, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import Avatar from '@/components/Avatar';
import { PROJECT_STATUS_VISUALS, resolveProjectStatus } from '@/components/ExecutionStatus';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import NavHeader from '@/features/NavHeader';
import {
  SidebarHeaderSelectPopover,
  SidebarHeaderSelectTrigger,
} from '@/features/NavPanel/SidebarHeaderSelect';
import type { SwitcherItem } from '@/features/NavPanel/switcher/switcherItems';
import SwitcherMenu from '@/features/NavPanel/switcher/SwitcherMenu';
import { useProjectMembersQuery } from '@/features/Teammates/api/hooks';
import { useTeammatesEnabled } from '@/features/Teammates/useTeammatesEnabled';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
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
  // Same glyph and colour the project list and the rail draw for this status.
  const headerStatusVisual = PROJECT_STATUS_VISUALS[resolveProjectStatus(detail?.project.status)];

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
                color={headerStatusVisual.color}
                icon={<Icon icon={headerStatusVisual.icon} size={12} />}
                shape={'round'}
                size={'small'}
              >
                {t(`status.${detail.project.status}`, {
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
        <Flexbox horizontal gap={4}>
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
        </Flexbox>
        <div ref={toolbarRef} />
      </Flexbox>
    </>
  );
});

ProjectTabsBar.displayName = 'ProjectTabsBar';

export default ProjectTabsBar;
