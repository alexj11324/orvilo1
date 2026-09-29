'use client';

import { Block, type DropdownItem, DropdownMenu, Flexbox, Icon } from '@lobehub/ui';
import { ActionIcon, Text, toast } from '@lobehub/ui/base-ui';
import { ArrowUpRight, CheckIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { getProjectMilestoneIssuesPath } from '@/features/Projects/milestoneFilter';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { usePermission } from '@/hooks/usePermission';
import { useCurrentProjectList, useProjectStore } from '@/store/project';
import { taskDetailSelectors } from '@/store/task/selectors';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { formatTaskItemDate } from '../features/formatTaskItemDate';
import { useActiveTaskProject } from '../shared/useActiveTaskProject';
import { useTaskProjectChange } from '../shared/useTaskProjectChange';
import { RAIL_VALUE_FONT_SIZE } from './railText';
import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

/**
 * The rail's "Project" group — Linear files every issue under a project or a
 * team, so the rail shows the owning project as a chip plus the milestone row
 * underneath it. The project value is a picker when the task is editable —
 * including the discoverable "No project" empty state — while navigation to
 * the project stays a separate trailing affordance; read-only keeps the row
 * as the link it always was.
 */
const TaskProjectSection = memo(() => {
  const { t } = useTranslation(['chat', 'project']);
  const { i18n, t: tCommon } = useTranslation('common');
  const navigate = useWorkspaceAwareNavigate();
  const taskId = useTaskDetailTaskId();
  const taskProjectId = useTaskDetailSelector(
    (s, id) => taskDetailSelectors.taskDetail(s, id)?.projectId,
  );
  const { milestone, milestones, project, projectRef, taskDatabaseId } =
    useActiveTaskProject(taskId);
  const setTaskMilestone = useProjectStore((s) => s.setTaskMilestone);
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const { allowed: canEditTask } = usePermission('create_content');
  const [pending, setPending] = useState(false);
  const { apply: applyProject, pending: projectPending } = useTaskProjectChange({ taskId });

  // The picker reads the same scope-filtered project list the sidebar uses —
  // an invisible project can never be offered, let alone selected.
  const canPickProject = canEditTask && Boolean(taskId);
  useProjectStore((s) => s.useFetchProjectList)(canPickProject);
  const projects = useCurrentProjectList();

  // `manageable()` on the server is `projects.userId = me` — the same gate the
  // project overview's milestone assign menu uses, so a member sees the
  // milestone but cannot re-file it.
  const canEdit = canEditTask && !!project?.userId && project.userId === currentUserId;

  const milestoneItems = useMemo<DropdownItem[]>(() => {
    if (!project) return [];
    const change = async (milestoneId: string | null) => {
      if (!taskDatabaseId || pending) return;
      setPending(true);
      try {
        await setTaskMilestone(project.id, taskDatabaseId, milestoneId);
      } catch {
        // Store action revalidates the project detail on success; on failure
        // the row keeps its last state and the toast carries the reason.
        toast.error(t('taskDetail.milestone.updateFailed'));
      } finally {
        setPending(false);
      }
    };
    return [
      ...milestones.map((row) => ({
        icon: row.id === milestone?.id ? <Icon icon={CheckIcon} /> : undefined,
        key: row.id,
        label: (
          <Flexbox horizontal align={'center'} gap={8} justify={'space-between'}>
            <span>{row.name}</span>
            {row.date && (
              <Text fontSize={12} type={'secondary'}>
                {formatTaskItemDate(row.date, {
                  formatOtherYear: tCommon('time.formatOtherYear'),
                  formatThisYear: tCommon('time.formatThisYear'),
                  locale: i18n.language,
                })}
              </Text>
            )}
          </Flexbox>
        ),
        onClick: () => void change(row.id),
      })),
      { type: 'divider' },
      {
        icon: !milestone ? <Icon icon={CheckIcon} /> : undefined,
        key: 'none',
        label: t('taskList.noMilestone'),
        onClick: () => void change(null),
      },
    ];
  }, [project, milestones, milestone, taskDatabaseId, pending, setTaskMilestone, t, i18n, tCommon]);

  // A project write re-files the task; the project's task catalog on both
  // sides of the move is reconciled inside useTaskProjectChange.
  const projectItems = useMemo<DropdownItem[]>(() => {
    const change = (next: string | null) => {
      if (projectPending || next === taskProjectId) return;
      void applyProject(next, taskProjectId);
    };
    return [
      ...projects.map((row) => ({
        icon: row.id === taskProjectId ? <Icon icon={CheckIcon} /> : undefined,
        key: row.id,
        label: (
          <Flexbox horizontal align={'center'} gap={8} style={{ minWidth: 0 }}>
            <Avatar
              avatar={row.avatar || undefined}
              name={row.name}
              shape={'square'}
              size={16}
              style={{ flex: 'none' }}
            />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</span>
          </Flexbox>
        ),
        onClick: () => change(row.id),
      })),
      { type: 'divider' },
      {
        icon: !taskProjectId ? <Icon icon={CheckIcon} /> : undefined,
        key: 'none',
        label: t('taskDetail.noProject'),
        onClick: () => change(null),
      },
    ];
  }, [projects, taskProjectId, projectPending, applyProject, t]);

  if (!taskProjectId && !canPickProject) return null;

  const listedProject = taskProjectId
    ? projects.find((row) => row.id === taskProjectId)
    : undefined;
  // The detail row is authoritative once loaded; the list row covers the
  // detail-fetch window, and neither leaks a name the scope can't see.
  const projectName = project?.name ?? listedProject?.name;

  const milestoneDate = milestone?.date
    ? formatTaskItemDate(milestone.date, {
        formatOtherYear: tCommon('time.formatOtherYear'),
        formatThisYear: tCommon('time.formatThisYear'),
        locale: i18n.language,
      })
    : null;

  // Editable → the row is Linear's milestone picker (a dropdown trigger);
  // read-only → the same row links to the milestone-filtered issues list.
  const milestoneRow = canEdit ? (
    <DropdownMenu items={milestoneItems} placement={'bottomRight'}>
      <Block
        clickable
        horizontal
        align={'center'}
        className={styles.railRow}
        gap={8}
        title={t('taskDetail.milestone.hint')}
        variant={'borderless'}
      >
        <MilestoneIcon size={14} style={{ flex: 'none' }} />
        <Text
          ellipsis
          fontSize={RAIL_VALUE_FONT_SIZE}
          style={{ minWidth: 0 }}
          type={milestone ? undefined : 'secondary'}
          weight={500}
        >
          {milestone ? milestone.name : t('taskList.noMilestone')}
        </Text>
        {milestoneDate && (
          <Text fontSize={RAIL_VALUE_FONT_SIZE} style={{ flex: 'none' }} type={'secondary'}>
            {`· ${milestoneDate}`}
          </Text>
        )}
      </Block>
    </DropdownMenu>
  ) : (
    <Block
      clickable
      horizontal
      align={'center'}
      className={styles.railRow}
      gap={8}
      title={milestone ? t('overview.milestoneSeeIssues', { ns: 'project' }) : undefined}
      variant={'borderless'}
      onClick={() =>
        milestone && projectRef && navigate(getProjectMilestoneIssuesPath(projectRef, milestone.id))
      }
    >
      <MilestoneIcon size={14} style={{ flex: 'none' }} />
      <Text ellipsis fontSize={RAIL_VALUE_FONT_SIZE} style={{ minWidth: 0 }} weight={500}>
        {milestone ? milestone.name : t('taskList.noMilestone')}
      </Text>
      {milestoneDate && (
        <Text fontSize={RAIL_VALUE_FONT_SIZE} style={{ flex: 'none' }} type={'secondary'}>
          {`· ${milestoneDate}`}
        </Text>
      )}
    </Block>
  );

  const projectValue = (
    <>
      {projectName ? (
        <Avatar
          avatar={(project ?? listedProject)?.avatar || undefined}
          name={projectName}
          shape={'square'}
          size={16}
          style={{ flex: 'none' }}
        />
      ) : null}
      <Text
        ellipsis
        fontSize={RAIL_VALUE_FONT_SIZE}
        style={{ minWidth: 0 }}
        type={projectName ? undefined : 'secondary'}
        weight={500}
      >
        {projectName ?? t('taskDetail.noProject')}
      </Text>
    </>
  );

  // The row is the picker's trigger when the task is editable; navigation
  // stays a distinct affordance beside it, so one click never both picks
  // and leaves the page. Read-only keeps the whole row as the link.
  const projectRow = canPickProject ? (
    <Flexbox horizontal align={'center'} gap={4} style={{ minWidth: 0 }}>
      <DropdownMenu items={projectItems} placement={'bottomRight'}>
        <Block
          clickable
          horizontal
          align={'center'}
          className={styles.railRow}
          flex={1}
          gap={8}
          style={{ minWidth: 0 }}
          title={projectPending ? undefined : (projectName ?? t('taskDetail.noProject'))}
          variant={'borderless'}
        >
          {projectValue}
        </Block>
      </DropdownMenu>
      {project && projectRef ? (
        <ActionIcon
          icon={ArrowUpRight}
          size={'small'}
          title={t('taskDetail.openProject')}
          onClick={() => navigate(`/project/${projectRef}`)}
        />
      ) : null}
    </Flexbox>
  ) : project && projectRef ? (
    <Block
      clickable
      horizontal
      align={'center'}
      className={styles.railRow}
      gap={8}
      title={project.name}
      variant={'borderless'}
      onClick={() => navigate(`/project/${projectRef}`)}
    >
      {projectValue}
    </Block>
  ) : null;

  return (
    <div className={styles.railSection}>
      <span className={styles.railSectionLabel}>{t('taskDetail.project')}</span>
      {projectRow}
      {/* The milestone row only exists where a milestone could: set, or a
          catalog the picker can file under. A project with zero milestones
          shows no row at all — there is nothing to choose and no state to
          claim. */}
      {(milestone || (canEdit && milestones.length > 0)) && project && milestoneRow}
    </div>
  );
});

TaskProjectSection.displayName = 'TaskProjectSection';

export default TaskProjectSection;
