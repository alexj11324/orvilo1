'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import {
  ActionIcon,
  confirmModal,
  type DropdownItem,
  DropdownMenu,
  toast,
} from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import { ActivityIcon, EllipsisIcon, LinkIcon, StarIcon, TrashIcon } from 'lucide-react';
import { memo, type Ref, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';

import { useWorkFavoriteToggle } from '@/features/HomeSidebar/Body/useWorkFavoriteToggle';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import NavHeader from '@/features/NavHeader';
import {
  SidebarHeaderSelectPopover,
  SidebarHeaderSelectTrigger,
} from '@/features/NavPanel/SidebarHeaderSelect';
import type { SwitcherItem } from '@/features/NavPanel/switcher/switcherItems';
import SwitcherMenu from '@/features/NavPanel/switcher/SwitcherMenu';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useActiveRouteParams } from '@/hooks/useActiveRouteParams';
import { useCurrentProjectDetail, useCurrentProjectList, useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import {
  getProjectActivityPath,
  getProjectOverviewPath,
  getProjectTasksPath,
  projectPathSection,
} from './navigation';

const styles = createStaticStyles(({ css, cssVar }) => ({
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

interface ProjectTabsBarProps {
  onTogglePanel?: () => void;
  panelOpen?: boolean;
  toolbarRef?: Ref<HTMLDivElement>;
}

// Linear shape: project navigation is a tab strip in the content header, not a
// second left rail — the workspace nav panel is the only rail on /project/*.
const ProjectTabsBar = memo<ProjectTabsBarProps>(({ onTogglePanel, panelOpen, toolbarRef }) => {
  const { t } = useTranslation(['project', 'common']);
  const { projectId } = useActiveRouteParams<{ projectId: string }>();
  const navigate = useWorkspaceAwareNavigate();
  const { pathname } = useLocation();
  const detail = useCurrentProjectDetail(projectId);
  const projects = useCurrentProjectList();
  const { error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectList)(true);

  const currentUserId = useUserStore(userProfileSelectors.userId);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const { pinned, toggle: toggleFavorite } = useWorkFavoriteToggle('project', detail?.project.id);

  const projectReference = detail?.project.slug ?? projectId ?? '';
  // Deletion stays owner-only — the same gate the projects list applies.
  const canDelete = !!detail?.project.userId && currentUserId === detail?.project.userId;

  const items = useMemo<SwitcherItem[]>(
    () =>
      projects.map((item) => ({
        avatar: item.avatar || undefined,
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

  const copyPageUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast.success(t('savedViews.linkCopied', { ns: 'common' }));
    } catch {
      toast.error(t('savedViews.linkCopyFailed', { ns: 'common' }));
    }
  }, [t]);

  const confirmDelete = useCallback(() => {
    if (!detail) return;
    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: t('list.deleteConfirmDescription', { name: detail.project.name }),
      okButtonProps: { danger: true },
      okText: t('delete', { ns: 'common' }),
      title: t('list.deleteConfirmTitle'),
      onOk: async () => {
        try {
          await deleteProject(detail.project.id);
          toast.success(t('list.deleteSuccess', { name: detail.project.name }));
          navigate('/projects');
        } catch (error) {
          console.error('Failed to delete project', error);
          toast.error(t('list.deleteError'));
        }
      },
    });
  }, [deleteProject, detail, navigate, t]);

  // Linear's "Project actions" ⋯ menu: Copy ▸, Favorite, Subscribe ▸, Remind
  // me ▸, Change update schedule…, Configure Slack notifications…, Show
  // description history, Show updates and activity, Delete. The honest subset
  // is every item Orvilo can back today — favorites, the page URL, the
  // activity surface and owner-gated delete; the rest aren't modeled.
  const menuItems = useMemo<DropdownItem[]>(
    () => [
      {
        icon: <Icon icon={StarIcon} />,
        key: 'favorite',
        label: pinned
          ? t('savedViews.unfavorite', { ns: 'common' })
          : t('savedViews.favorite', { ns: 'common' }),
        onClick: () => void toggleFavorite(),
      },
      {
        icon: <Icon icon={LinkIcon} />,
        key: 'copyUrl',
        label: t('header.copyPageUrl'),
        onClick: () => void copyPageUrl(),
      },
      {
        icon: <Icon icon={ActivityIcon} />,
        key: 'activity',
        label: t('header.showUpdatesAndActivity'),
        onClick: () => navigate(getProjectActivityPath(projectReference)),
      },
      ...(canDelete
        ? [
            { type: 'divider' as const },
            {
              danger: true,
              icon: <Icon icon={TrashIcon} />,
              key: 'delete',
              label: t('delete', { ns: 'common' }),
              onClick: confirmDelete,
            },
          ]
        : []),
    ],
    [pinned, toggleFavorite, copyPageUrl, t, navigate, projectReference, canDelete, confirmDelete],
  );

  // Linear's project header is exactly Overview | Activity | Issues — verified
  // 2026-09-24 on the live reference, including on a project that HAS a
  // milestone (Daymark): milestones live as an overview body section and a
  // rail card, never a tab. The /milestones route still resolves for deep
  // links; it just isn't a tab. Goals and resources likewise live as sections
  // on the Overview body.
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

  // Linear's header-left is [project switcher, ☆ Add to favorites, ⋯ Project
  // actions]; header-right is [🔗 Copy page URL, 🔔 notifications, panel
  // collapse]. The status pill and member stack Orvilo carried live in the
  // rail's Properties card instead — the reference header has neither.
  return (
    <>
      <NavHeader
        left={
          <Flexbox horizontal align={'center'} gap={4}>
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
                avatar={detail?.project.avatar || undefined}
                name={detail?.project.name || t('sidebar.title')}
                title={detail?.project.name || t('sidebar.title')}
              />
            </SidebarHeaderSelectPopover>
            {detail?.project.id && (
              <>
                <WorkFavoriteButton
                  icon={'star'}
                  targetId={detail.project.id}
                  targetType="project"
                  variant="icon"
                />
                <DropdownMenu items={menuItems} placement={'bottomRight'}>
                  <ActionIcon
                    icon={EllipsisIcon}
                    size={'small'}
                    title={t('header.projectActions')}
                  />
                </DropdownMenu>
              </>
            )}
          </Flexbox>
        }
        right={
          detail?.project.id ? (
            <Flexbox horizontal align={'center'} gap={8}>
              <ActionIcon
                aria-label={t('header.copyPageUrl')}
                icon={LinkIcon}
                size={'small'}
                title={t('header.copyPageUrl')}
                onClick={() => void copyPageUrl()}
              />
              <ToggleRightPanelButton
                expand={panelOpen}
                id={null}
                title={t('header.closeDetails')}
                onToggle={onTogglePanel}
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
