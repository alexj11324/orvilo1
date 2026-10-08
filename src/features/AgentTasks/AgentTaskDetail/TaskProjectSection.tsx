'use client';

import { cn } from 'cn';
import { ArrowUpRight, CheckIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { toast } from '@/components/toast';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { getProjectMilestoneIssuesPath } from '@/features/Projects/milestoneFilter';
import MilestoneIcon from '@/features/Projects/MilestoneIcon';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
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
 * A rail row drawn on the local 28px Button so it is focusable and keyboard
 * operable. `railRow` owns the geometry; the utilities only undo the Button's
 * centred, bordered label layout.
 */
const railRowButtonClass = cn('justify-start gap-2 border-0 font-normal', styles.railRow);

/**
 * Read-only rows navigate, so they stay real links (role and href intact) and
 * only borrow the same Button look.
 */
const railRowLinkClass = cn(buttonVariants({ size: 'sm', variant: 'ghost' }), railRowButtonClass);

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

  const changeMilestone = useMemo(() => {
    if (!project) return null;
    const projectId = project.id;
    return async (milestoneId: string | null) => {
      if (!taskDatabaseId || pending) return;
      setPending(true);
      try {
        await setTaskMilestone(projectId, taskDatabaseId, milestoneId);
      } catch {
        // Store action revalidates the project detail on success; on failure
        // the row keeps its last state and the toast carries the reason.
        toast.error(t('taskDetail.milestone.updateFailed'));
      } finally {
        setPending(false);
      }
    };
  }, [project, taskDatabaseId, pending, setTaskMilestone, t]);

  // A project write re-files the task; the project's task catalog on both
  // sides of the move is reconciled inside useTaskProjectChange.
  const changeProject = useMemo(
    () => (next: string | null) => {
      if (projectPending || next === taskProjectId) return;
      void applyProject(next, taskProjectId);
    },
    [projectPending, applyProject, taskProjectId],
  );

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

  const milestoneValue = (
    <>
      <MilestoneIcon size={14} style={{ flex: 'none' }} />
      <div
        style={{ fontSize: RAIL_VALUE_FONT_SIZE }}
        className={cn(
          'block min-w-0 truncate font-medium',
          milestone ? undefined : 'text-muted-foreground',
        )}
      >
        {milestone ? milestone.name : t('taskList.noMilestone')}
      </div>
      {milestoneDate && (
        <div className="flex-none text-muted-foreground" style={{ fontSize: RAIL_VALUE_FONT_SIZE }}>
          {`· ${milestoneDate}`}
        </div>
      )}
    </>
  );

  // Editable → the row is Linear's milestone picker (a dropdown trigger);
  // read-only → the same row links to the milestone-filtered issues list.
  const milestoneRow =
    canEdit && changeMilestone ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              className={railRowButtonClass}
              size="sm"
              title={t('taskDetail.milestone.hint')}
              variant="ghost"
            />
          }
        >
          {milestoneValue}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={'end'} className={'min-w-52'}>
          <DropdownMenuGroup>
            {milestones.map((row) => (
              <DropdownMenuItem key={row.id} onClick={() => void changeMilestone(row.id)}>
                <CheckIcon className={cn(row.id !== milestone?.id && 'opacity-0')} />
                <span className={'flex-1'}>{row.name}</span>
                {row.date && (
                  <div className="text-xs text-muted-foreground">
                    {formatTaskItemDate(row.date, {
                      formatOtherYear: tCommon('time.formatOtherYear'),
                      formatThisYear: tCommon('time.formatThisYear'),
                      locale: i18n.language,
                    })}
                  </div>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => void changeMilestone(null)}>
              <CheckIcon className={cn(milestone && 'opacity-0')} />
              <span className={'flex-1'}>{t('taskList.noMilestone')}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : milestone && projectRef ? (
      <WorkspaceLink
        className={railRowLinkClass}
        title={t('overview.milestoneSeeIssues', { ns: 'project' })}
        to={getProjectMilestoneIssuesPath(projectRef, milestone.id)}
      >
        {milestoneValue}
      </WorkspaceLink>
    ) : (
      <div className={cn('flex items-center gap-2', styles.railRow)}>{milestoneValue}</div>
    );

  const projectValue = (
    <>
      {projectName ? (
        <Avatar
          avatar={(project ?? listedProject)?.avatar || undefined}
          name={projectName}
          shape={'square'}
          size={16}
        />
      ) : null}
      <div
        style={{ fontSize: RAIL_VALUE_FONT_SIZE }}
        className={cn(
          'block min-w-0 truncate font-medium',
          projectName ? undefined : 'text-muted-foreground',
        )}
      >
        {projectName ?? t('taskDetail.noProject')}
      </div>
    </>
  );

  // The row is the picker's trigger when the task is editable; navigation
  // stays a distinct affordance beside it, so one click never both picks
  // and leaves the page. Read-only keeps the whole row as the link.
  const projectRow = canPickProject ? (
    <div className="flex min-w-0 items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              className={cn(railRowButtonClass, 'min-w-0 flex-1 shrink')}
              size="sm"
              title={projectPending ? undefined : (projectName ?? t('taskDetail.noProject'))}
              variant="ghost"
            />
          }
        >
          {projectValue}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={'end'} className={'min-w-52'}>
          <DropdownMenuGroup>
            {projects.map((row) => (
              <DropdownMenuItem key={row.id} onClick={() => changeProject(row.id)}>
                <CheckIcon className={cn(row.id !== taskProjectId && 'opacity-0')} />
                <Avatar
                  avatar={row.avatar || undefined}
                  name={row.name}
                  shape={'square'}
                  size={16}
                />
                <span className="flex-1 truncate">{row.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => changeProject(null)}>
              <CheckIcon className={cn(taskProjectId && 'opacity-0')} />
              <span className={'flex-1'}>{t('taskDetail.noProject')}</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {project && projectRef ? (
        <ActionIcon
          icon={ArrowUpRight}
          size={'small'}
          title={t('taskDetail.openProject')}
          onClick={() => navigate(`/project/${projectRef}`)}
        />
      ) : null}
    </div>
  ) : project && projectRef ? (
    <WorkspaceLink className={railRowLinkClass} title={project.name} to={`/project/${projectRef}`}>
      {projectValue}
    </WorkspaceLink>
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
