'use client';

import { Center, ContextMenuTrigger, Empty, Flexbox, Icon, Input, SearchBar } from '@lobehub/ui';
import {
  ActionIcon,
  Button,
  confirmModal,
  type DropdownItem,
  DropdownMenu,
  Popover,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import type { ProjectHealth } from '@orvilo/types';
import { createStaticStyles, cssVar, useTheme } from 'antd-style';
import dayjs from 'dayjs';
import {
  BoxIcon,
  CircleCheckIcon,
  CircleDashedIcon,
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

import AsyncError from '@/components/AsyncError';
import Avatar from '@/components/Avatar';
import { PROJECT_STATUS_VISUALS, resolveProjectStatus } from '@/components/ExecutionStatus';
import { PriorityIcon, resolvePriorityLevel } from '@/components/PriorityIcon';
import NavHeader from '@/features/NavHeader';
import SkeletonList from '@/features/NavPanel/components/SkeletonList';
import { openCreateProjectModal } from '@/features/Projects/CreateProjectModal';
import { NoLeadIcon } from '@/features/Projects/List/NoLeadIcon';
import { ProjectActiveStatusIcon } from '@/features/Projects/ProjectActiveStatusIcon';
import ProjectDisabled from '@/features/Projects/ProjectDisabled';
import { useWorkspaceMembersQuery } from '@/features/Teammates/api/hooks';
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
    font-weight: 450;
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
  leadEmpty: css`
    opacity: 0;

    &:focus-visible {
      opacity: 1;
    }

    @media (hover: none) {
      opacity: 1;
    }
  `,
  leadOpen: css`
    opacity: 1;
  `,
  leadOption: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;

    width: 100%;
    min-height: 32px;
    padding-inline: 8px;
    border: 0;
    border-radius: 4px;

    color: ${cssVar.colorText};
    text-align: start;

    background: transparent;

    &:hover,
    &:focus-visible {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  leadPopover: css`
    overflow: auto;
    width: 240px;
    max-height: 320px;
    padding: 4px;
  `,
  leadTrigger: css`
    cursor: pointer;

    display: inline-flex;
    align-items: center;
    justify-content: center;

    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 4px;

    color: ${cssVar.colorTextSecondary};

    background: transparent;

    &:hover,
    &:focus-visible {
      background: ${cssVar.colorFillTertiary};
    }
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
    min-height: 48px;
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

    &:hover .project-lead-empty,
    &:focus-within .project-lead-empty {
      opacity: 1;
    }
  `,
  screenReaderOnly: css`
    position: absolute;

    overflow: hidden;

    width: 1px;
    height: 1px;
    padding: 0;
    border: 0;

    white-space: nowrap;

    clip-path: inset(50%);
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

const ProjectHealthCell = memo<{ health?: ProjectHealth | null }>(({ health }) => {
  const { t } = useTranslation('project');
  const theme = useTheme();
  if (!health || !(health in PROJECT_HEALTH_META)) {
    return (
      <Flexbox horizontal align={'center'} className={styles.cell} gap={6}>
        <Icon icon={CircleDashedIcon} size={14} />
        <Text fontSize={12}>{t('list.health.noUpdates')}</Text>
      </Flexbox>
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

type MembersQuery = ReturnType<typeof useWorkspaceMembersQuery>;

const ProjectLeadCell = memo<{ members: MembersQuery; project: ProjectListItem }>(
  ({ members, project }) => {
    const { t } = useTranslation('project');
    const [open, setOpen] = useState(false);
    const [keyword, setKeyword] = useState('');
    const [saving, setSaving] = useState(false);
    const updateProject = useProjectStore((s) => s.updateProject);
    const lead = members.data?.find((member) => member.userId === project.leadUserId);
    const leadName = lead?.user?.fullName || lead?.user?.username || project.leadUserId;
    const availableMembers = useMemo(() => {
      if (!open) return [];
      const normalizedKeyword = keyword.trim().toLocaleLowerCase();
      return (members.data ?? [])
        .filter((member) => {
          if (member.deletedAt || member.suspendedAt) return false;
          const name = member.user?.fullName || member.user?.username || member.userId;
          return name.toLocaleLowerCase().includes(normalizedKeyword);
        })
        .sort((a, b) => {
          const nameA = a.user?.fullName || a.user?.username || a.userId;
          const nameB = b.user?.fullName || b.user?.username || b.userId;
          return nameA.toLocaleLowerCase().localeCompare(nameB.toLocaleLowerCase());
        });
    }, [keyword, members.data, open]);

    const saveLead = async (leadUserId: string | null) => {
      if (saving || leadUserId === project.leadUserId) {
        setOpen(false);
        return;
      }
      setSaving(true);
      try {
        await updateProject(project.id, { leadUserId });
        setOpen(false);
      } catch (error) {
        console.error('Failed to update project lead', error);
        toast.error(t('properties.saveError'));
      } finally {
        setSaving(false);
      }
    };

    return (
      <Popover
        open={open}
        placement="bottomLeft"
        trigger="click"
        content={
          <Flexbox
            className={styles.leadPopover}
            gap={4}
            onClick={(event) => event.stopPropagation()}
          >
            <Input
              autoFocus
              aria-label={t('list.lead.search')}
              placeholder={t('list.lead.search')}
              size="small"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
            />
            <button
              className={styles.leadOption}
              disabled={saving}
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void saveLead(null);
              }}
            >
              <NoLeadIcon />
              {t('properties.noLead')}
            </button>
            {members.isLoading ? (
              <Text fontSize={12} type="secondary">
                {t('list.lead.loading')}
              </Text>
            ) : members.error ? (
              <AsyncError error={members.error} variant="inline" onRetry={() => members.mutate()} />
            ) : availableMembers.length === 0 ? (
              <Text fontSize={12} type="secondary">
                {t('list.lead.noMatches')}
              </Text>
            ) : (
              availableMembers.map((member) => {
                const name = member.user?.fullName || member.user?.username || member.userId;
                return (
                  <button
                    className={styles.leadOption}
                    disabled={saving}
                    key={member.userId}
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      void saveLead(member.userId);
                    }}
                  >
                    <Avatar avatar={member.user?.avatar ?? undefined} name={name} size={18} />
                    {name}
                  </button>
                );
              })
            )}
          </Flexbox>
        }
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) setKeyword('');
        }}
      >
        <button
          aria-label={leadName ? `${t('properties.lead')}: ${leadName}` : t('properties.noLead')}
          className={`${styles.leadTrigger} ${!project.leadUserId ? `${styles.leadEmpty} project-lead-empty` : ''} ${open ? styles.leadOpen : ''}`}
          disabled={saving}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
        >
          {project.leadUserId ? (
            <Avatar
              avatar={lead?.user?.avatar ?? undefined}
              name={leadName}
              shape="circle"
              size={20}
              title={leadName}
            />
          ) : (
            <NoLeadIcon />
          )}
        </button>
      </Popover>
    );
  },
);

ProjectLeadCell.displayName = 'ProjectLeadCell';

const ProjectRow = memo<{ members: MembersQuery; project: ProjectListItem }>(
  ({ members, project }) => {
    const { t } = useTranslation(['project', 'common']);
    const [deleting, setDeleting] = useState(false);
    const deleteProject = useProjectStore((s) => s.deleteProject);
    const currentUserId = useUserStore(userProfileSelectors.userId);
    const canDelete = currentUserId === project.userId;
    const priority = resolvePriorityLevel(project.priority);
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
            {project.avatar && project.avatar !== '📦' ? (
              <Avatar avatar={project.avatar} name={project.name} shape={'square'} size={18} />
            ) : (
              <Icon color={cssVar.colorTextTertiary} icon={BoxIcon} size={16} />
            )}
            <Text ellipsis fontSize={13} weight={500}>
              {project.name}
            </Text>
          </Flexbox>
          <ProjectHealthCell health={project.health} />
          <span className={styles.cell} title={t(PROJECT_PRIORITY_LABEL_KEY[priority])}>
            <PriorityIcon
              aria-label={t(PROJECT_PRIORITY_LABEL_KEY[priority])}
              priority={priority}
              role="img"
              size={16}
            />
          </span>
          <ProjectLeadCell members={members} project={project} />
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
          <Flexbox horizontal align={'center'} className={styles.cell} gap={6}>
            <span className={styles.screenReaderOnly}>{t(`status.${status}`)}</span>
            {status === 'active' ? (
              <ProjectActiveStatusIcon color={statusVisual.color} />
            ) : (
              <Icon aria-hidden color={statusVisual.color} icon={statusVisual.icon} size={14} />
            )}
            <Text fontSize={12}>
              {project.progressPercent == null ? '—' : `${project.progressPercent}%`}
            </Text>
          </Flexbox>
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
  },
);

ProjectRow.displayName = 'ProjectRow';

const ProjectListPage = memo(() => {
  const { t } = useTranslation('project');
  const [keyword, setKeyword] = useState('');
  const enabled = useUserStore(labPreferSelectors.enableProjects);
  const projects = useCurrentProjectList();
  const { error, isLoading, mutate } = useProjectStore((s) => s.useFetchProjectList)(enabled);
  const {
    data: membersData,
    error: membersError,
    isLoading: membersLoading,
    mutate: revalidateMembers,
  } = useWorkspaceMembersQuery({ enabled });
  // The hook returns a fresh object each render; rebuild a stable one so the
  // memoized rows below skip unrelated re-renders (e.g. search keystrokes).
  const members = useMemo<MembersQuery>(
    () => ({
      data: membersData,
      error: membersError,
      isLoading: membersLoading,
      members: membersData,
      mutate: revalidateMembers,
    }),
    [membersData, membersError, membersLoading, revalidateMembers],
  );

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
                {t('list.columnTarget', { defaultValue: 'Target date' })}
              </Text>
              <Text className={styles.cell} fontSize={12} type={'secondary'}>
                {t('list.columnIssues', { defaultValue: 'Issues' })}
              </Text>
              <Text className={styles.cell} fontSize={12} type={'secondary'}>
                {t('list.columnStatus', { defaultValue: 'Status' })}
              </Text>
            </Flexbox>
            {filteredProjects.map((project) => (
              <ProjectRow key={project.id} members={members} project={project} />
            ))}
          </Flexbox>
        )}
      </WorkSurfaceCollection>
    </WorkSurface>
  );
});

ProjectListPage.displayName = 'ProjectListPage';

export default ProjectListPage;
