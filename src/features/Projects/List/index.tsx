'use client';

import { Center, ContextMenuTrigger, Empty, Flexbox, Icon, SearchBar, Tooltip } from '@lobehub/ui';
import {
  ActionIcon,
  Button,
  confirmModal,
  type DropdownItem,
  DropdownMenu,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import { createStaticStyles } from 'antd-style';
import dayjs from 'dayjs';
import {
  FolderClosedIcon,
  MoreHorizontalIcon,
  PlusIcon,
  SearchXIcon,
  TrashIcon,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { PROJECT_STATUS_VISUALS, resolveProjectStatus } from '@/components/ExecutionStatus';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { openCreateProjectModal } from '@/features/Projects/CreateProjectModal';
import ProjectDisabled from '@/features/Projects/ProjectDisabled';
import TopicCreatorAvatar from '@/features/TopicCreatorAvatar';
import UserAvatar from '@/features/User/UserAvatar';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { WorkSurface, WorkSurfaceCollection, WorkSurfaceToolbar } from '@/features/WorkSurface';
import { useCurrentProjectList, useProjectStore } from '@/store/project';
import type { ProjectListItem } from '@/store/project/store';
import { useUserStore } from '@/store/user';
import { labPreferSelectors, userProfileSelectors } from '@/store/user/selectors';

const styles = createStaticStyles(({ css, cssVar }) => ({
  actions: css`
    flex: none;
    opacity: 0;
    transition: opacity ${cssVar.motionDurationFast};

    @media (hover: none) {
      opacity: 1;
    }
  `,
  cell: css`
    flex: none;

    width: 96px;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    white-space: nowrap;
  `,
  headerRow: css`
    padding-block: 4px;
    padding-inline: 28px 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  link: css`
    display: flex;
    flex: 1;
    gap: 10px;
    align-items: center;

    min-width: 0;

    color: inherit;
  `,
  nameCell: css`
    flex: 1;
    min-width: 0;
  `,
  owner: css`
    flex: none;
    width: 96px;
  `,
  row: css`
    padding-block: 7px;
    padding-inline: 4px 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
    color: inherit;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }

    &:hover .project-row-actions,
    &:focus-within .project-row-actions {
      opacity: 1;
    }
  `,
  updatedAt: css`
    flex: none;

    width: 96px;

    font-size: 12px;
    color: ${cssVar.colorTextQuaternary};
    white-space: nowrap;
  `,
}));

const ProjectOwnerAvatar = memo<{ userId: string }>(({ userId }) => {
  const activeWorkspaceId = useActiveWorkspaceId();

  return (
    <span className={styles.owner}>
      {activeWorkspaceId ? (
        <TopicCreatorAvatar size={20} userId={userId} />
      ) : (
        <UserAvatar size={20} />
      )}
    </span>
  );
});

ProjectOwnerAvatar.displayName = 'ProjectOwnerAvatar';

const ProjectRow = memo<{ project: ProjectListItem }>(({ project }) => {
  const { t } = useTranslation(['project', 'common']);
  const [deleting, setDeleting] = useState(false);
  const deleteProject = useProjectStore((s) => s.deleteProject);
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const canDelete = currentUserId === project.userId;
  const status = resolveProjectStatus(project.status);
  const statusVisual = PROJECT_STATUS_VISUALS[status];

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteProject(project.id);
      toast.success(t('list.deleteSuccess', { name: project.name }));
    } catch (error) {
      console.error('Failed to delete project', error);
      toast.error(t('list.deleteError'));
      setDeleting(false);
    }
  };

  const menuItems: DropdownItem[] = [
    {
      danger: true,
      icon: <Icon icon={TrashIcon} />,
      key: 'delete',
      label: t('list.deleteAction'),
      onClick: () => {
        confirmModal({
          cancelText: t('cancel', { ns: 'common' }),
          content: t('list.deleteConfirmDescription', { name: project.name }),
          okButtonProps: { danger: true },
          okText: t('delete', { ns: 'common' }),
          onOk: () => void handleDelete(),
          title: t('list.deleteConfirmTitle'),
        });
      },
    },
  ];

  const row = (
    <Flexbox horizontal align={'center'} className={styles.row} gap={0}>
      <WorkspaceLink className={styles.link} to={`/project/${project.slug ?? project.id}`}>
        <Flexbox horizontal align={'center'} className={styles.nameCell} gap={10}>
          <Tooltip title={t(`acceptance.status.${status}`)}>
            <Icon color={statusVisual.color} icon={statusVisual.icon} size={16} />
          </Tooltip>
          <Text ellipsis weight={500}>
            {project.name}
          </Text>
          <Text className={styles.cell} fontSize={12}>
            {project.identifier}
          </Text>
        </Flexbox>
        <span className={styles.owner}>
          {project.userId ? <ProjectOwnerAvatar userId={project.userId} /> : null}
        </span>
        <Text className={styles.cell} fontSize={12}>
          {typeof project.taskCount === 'number' ? project.taskCount : '—'}
        </Text>
        <Text className={styles.cell} fontSize={12}>
          {t(`acceptance.status.${status}`)}
        </Text>
        <Text
          className={styles.updatedAt}
          title={dayjs(project.updatedAt).format('YYYY-MM-DD HH:mm')}
        >
          {dayjs(project.updatedAt).format('MMM D')}
        </Text>
      </WorkspaceLink>
      {canDelete && (
        <span className={`${styles.actions} project-row-actions`}>
          <DropdownMenu items={menuItems} placement={'bottomRight'}>
            <ActionIcon
              aria-label={t('list.moreActions')}
              icon={MoreHorizontalIcon}
              loading={deleting}
              size={'small'}
            />
          </DropdownMenu>
        </span>
      )}
    </Flexbox>
  );

  return canDelete ? <ContextMenuTrigger items={menuItems}>{row}</ContextMenuTrigger> : row;
});

ProjectRow.displayName = 'ProjectRow';

const ProjectListPage = memo(() => {
  const { t } = useTranslation('project');
  const [keyword, setKeyword] = useState('');
  const enabled = useUserStore(labPreferSelectors.enableProjects);
  const projects = useCurrentProjectList();
  const { error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectList)(enabled);

  const filteredProjects = useMemo(() => {
    const normalizedKeyword = keyword.trim().toLocaleLowerCase();
    return normalizedKeyword
      ? projects.filter((project) =>
          [project.name, project.identifier, project.description]
            .filter(Boolean)
            .some((value) => value!.toLocaleLowerCase().includes(normalizedKeyword)),
        )
      : projects;
  }, [keyword, projects]);

  if (!enabled) return <ProjectDisabled />;

  return (
    <WorkSurface>
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('list.title')}
          </Text>
        }
        right={
          <Button
            icon={PlusIcon}
            size={'small'}
            type="primary"
            onClick={() => openCreateProjectModal()}
          >
            {t('create.action')}
          </Button>
        }
      />
      <WorkSurfaceCollection
        toolbar={
          <WorkSurfaceToolbar>
            <SearchBar
              allowClear
              placeholder={t('list.searchPlaceholder')}
              style={{ maxWidth: 280 }}
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
          </WorkSurfaceToolbar>
        }
      >
        {error ? (
          <AsyncError error={error} onRetry={() => mutate()} />
        ) : isLoading && projects.length === 0 ? (
          <SkeletonList rows={8} />
        ) : filteredProjects.length === 0 ? (
          <Center flex={1} padding={48}>
            <Empty
              description={keyword.trim() ? t('list.searchEmpty') : t('list.emptyDescription')}
              icon={keyword.trim() ? SearchXIcon : FolderClosedIcon}
            />
          </Center>
        ) : (
          <Flexbox gap={0}>
            <Flexbox horizontal align={'center'} className={styles.headerRow} gap={0}>
              <Flexbox horizontal align={'center'} className={styles.nameCell} gap={10}>
                <span style={{ width: 16 }} />
                <Text fontSize={12} type={'secondary'}>
                  {t('list.columnName', { defaultValue: 'Name' })}
                </Text>
                <Text className={styles.cell} fontSize={12} type={'secondary'}>
                  {t('list.columnKey', { defaultValue: 'Key' })}
                </Text>
              </Flexbox>
              <span className={styles.owner}>
                <Text fontSize={12} type={'secondary'}>
                  {t('list.columnLead', { defaultValue: 'Lead' })}
                </Text>
              </span>
              <Text className={styles.cell} fontSize={12} type={'secondary'}>
                {t('list.columnIssues', { defaultValue: 'Issues' })}
              </Text>
              <Text className={styles.cell} fontSize={12} type={'secondary'}>
                {t('list.columnStatus', { defaultValue: 'Status' })}
              </Text>
              <Text className={styles.updatedAt} type={'secondary'}>
                {t('list.columnUpdated', { defaultValue: 'Updated' })}
              </Text>
            </Flexbox>
            {filteredProjects.map((project) => (
              <ProjectRow key={project.id} project={project} />
            ))}
          </Flexbox>
        )}
      </WorkSurfaceCollection>
    </WorkSurface>
  );
});

ProjectListPage.displayName = 'ProjectListPage';

export default ProjectListPage;
