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
import type { ProjectHealth } from '@orvilo/types';
import { createStaticStyles, useTheme } from 'antd-style';
import dayjs from 'dayjs';
import {
  CircleCheckIcon,
  CircleDotIcon,
  FolderClosedIcon,
  MoreHorizontalIcon,
  OctagonAlertIcon,
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

    min-width: 0;

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
    white-space: nowrap;
  `,
  headerRow: css`
    padding-block: 4px;
    padding-inline: 12px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    font-size: 12px;
    color: ${cssVar.colorTextTertiary};
  `,
  columns: css`
    display: grid;
    grid-template-columns: minmax(200px, 1fr) 96px 64px 84px 96px 48px 84px 24px;
    gap: 12px;
    align-items: center;

    min-width: 760px;
  `,
  link: css`
    display: contents;
    color: inherit;
  `,
  nameCell: css`
    flex: 1;
    min-width: 0;
  `,
  owner: css`
    flex: none;
    min-width: 0;
  `,
  row: css`
    min-height: 44px;
    padding-block: 7px;
    padding-inline: 12px;
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

    min-width: 0;

    font-size: 12px;
    color: ${cssVar.colorTextQuaternary};
    white-space: nowrap;
  `,
}));

const PROJECT_HEALTH_META = {
  atRisk: { icon: OctagonAlertIcon, key: 'list.health.atRisk' },
  offTrack: { icon: CircleCheckIcon, key: 'list.health.offTrack' },
  onTrack: { icon: CircleDotIcon, key: 'list.health.onTrack' },
} as const;

const PROJECT_PRIORITY_LABEL_KEY = {
  0: 'create.priority.noPriority',
  1: 'create.priority.urgent',
  2: 'create.priority.high',
  3: 'create.priority.normal',
  4: 'create.priority.low',
} as const;

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

const ProjectHealthCell = memo<{ health?: ProjectHealth | null }>(({ health }) => {
  const { t } = useTranslation('project');
  const theme = useTheme();
  if (!health || !(health in PROJECT_HEALTH_META)) {
    return (
      <Text className={styles.cell} fontSize={12} type={'secondary'}>
        —
      </Text>
    );
  }
  const meta = PROJECT_HEALTH_META[health];
  const color =
    health === 'onTrack'
      ? theme.colorSuccess
      : health === 'atRisk'
        ? theme.colorWarning
        : theme.colorError;
  return (
    <Flexbox horizontal align={'center'} className={styles.cell} gap={6}>
      <Icon color={color} icon={meta.icon} size={14} />
      <Text fontSize={12}>{t(meta.key, { defaultValue: health })}</Text>
    </Flexbox>
  );
});

ProjectHealthCell.displayName = 'ProjectHealthCell';

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
    <Flexbox horizontal align={'center'} className={`${styles.row} ${styles.columns}`} gap={0}>
      <WorkspaceLink className={styles.link} to={`/project/${project.slug ?? project.id}`}>
        <Flexbox horizontal align={'center'} className={styles.nameCell} gap={10}>
          <Tooltip title={t(`status.${status}`)}>
            <Icon color={statusVisual.color} icon={statusVisual.icon} size={16} />
          </Tooltip>
          <Text ellipsis weight={500}>
            {project.name}
          </Text>
        </Flexbox>
        <ProjectHealthCell health={project.health} />
        <Text className={styles.cell} fontSize={12}>
          {t(PROJECT_PRIORITY_LABEL_KEY[project.priority ?? 0])}
        </Text>
        <span className={styles.owner}>
          {project.leadUserId ? <ProjectOwnerAvatar userId={project.leadUserId} /> : null}
        </span>
        <Text
          className={styles.cell}
          fontSize={12}
          title={project.targetDate ? dayjs(project.targetDate).format('YYYY-MM-DD') : undefined}
        >
          {project.targetDate ? dayjs(project.targetDate).format('MMM D') : '—'}
        </Text>
        <Text className={styles.cell} fontSize={12}>
          {typeof project.taskCount === 'number' ? project.taskCount : '—'}
        </Text>
        <Text className={styles.cell} fontSize={12}>
          {t(`status.${status}`)}
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
        left={<Text weight={500}>{t('list.title')}</Text>}
        right={
          <Button
            icon={PlusIcon}
            shape={'round'}
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
            <Flexbox
              horizontal
              align={'center'}
              className={`${styles.headerRow} ${styles.columns}`}
              gap={0}
            >
              <Flexbox horizontal align={'center'} className={styles.nameCell} gap={10}>
                <Text fontSize={12} type={'secondary'}>
                  {t('list.columnName', { defaultValue: 'Name' })}
                </Text>
              </Flexbox>
              <Text className={styles.cell} fontSize={12} type={'secondary'}>
                {t('list.columnHealth', { defaultValue: 'Health' })}
              </Text>
              <Text className={styles.cell} fontSize={12} type={'secondary'}>
                {t('list.columnPriority', { defaultValue: 'Priority' })}
              </Text>
              <span className={styles.owner}>
                <Text fontSize={12} type={'secondary'}>
                  {t('list.columnLead', { defaultValue: 'Lead' })}
                </Text>
              </span>
              <Text className={styles.cell} fontSize={12} type={'secondary'}>
                {t('list.columnTarget', { defaultValue: 'Target' })}
              </Text>
              <Text className={styles.cell} fontSize={12} type={'secondary'}>
                {t('list.columnIssues', { defaultValue: 'Issues' })}
              </Text>
              <Text className={styles.cell} fontSize={12} type={'secondary'}>
                {t('list.columnStatus', { defaultValue: 'Status' })}
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
