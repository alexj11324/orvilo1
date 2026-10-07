'use client';

import { cn } from 'cn';
import { ArrowUpRight, BoxIcon, CheckIcon } from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  const milestoneTrigger = (title?: string) => (
    <div
      className={`flex cursor-pointer items-center gap-2 ${styles.railRow} ${styles.interactiveControl}`}
      title={title}
    >
      <MilestoneIcon size={14} style={{ flex: 'none' }} />
      <div
        style={{ minWidth: 0, fontSize: RAIL_VALUE_FONT_SIZE }}
        className={cn(
          'truncate',
          'block',
          'font-medium',
          milestone ? undefined : 'text-muted-foreground',
        )}
      >
        {milestone ? milestone.name : t('taskList.noMilestone')}
      </div>
      {milestoneDate && (
        <div
          className="text-muted-foreground"
          style={{ flex: 'none', fontSize: RAIL_VALUE_FONT_SIZE }}
        >
          {`· ${milestoneDate}`}
        </div>
      )}
    </div>
  );

  const milestoneRow =
    canEdit && changeMilestone ? (
      <DropdownMenu>
        <DropdownMenuTrigger
          nativeButton={false}
          render={milestoneTrigger(t('taskDetail.milestone.hint'))}
        />
        <DropdownMenuContent align={'end'} className={'min-w-52'}>
          {milestones.map((row) => (
            <DropdownMenuItem key={row.id} onClick={() => void changeMilestone(row.id)}>
              <span className={row.id === milestone?.id ? undefined : 'opacity-0'}>
                <CheckIcon size={16} />
              </span>
              <span className={'flex-1'}>{row.name}</span>
              {row.date && (
                <div className="text-[12px] text-muted-foreground">
                  {formatTaskItemDate(row.date, {
                    formatOtherYear: tCommon('time.formatOtherYear'),
                    formatThisYear: tCommon('time.formatThisYear'),
                    locale: i18n.language,
                  })}
                </div>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void changeMilestone(null)}>
            <span className={!milestone ? undefined : 'opacity-0'}>
              <CheckIcon size={16} />
            </span>
            <span className={'flex-1'}>{t('taskList.noMilestone')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : (
      <Button
        className={`justify-start gap-2 ${styles.railRow} ${styles.interactiveControl}`}
        disabled={!milestone || !projectRef}
        title={milestone ? t('overview.milestoneSeeIssues', { ns: 'project' }) : undefined}
        variant="ghost"
        onClick={() =>
          milestone &&
          projectRef &&
          navigate(getProjectMilestoneIssuesPath(projectRef, milestone.id))
        }
      >
        <MilestoneIcon size={14} style={{ flex: 'none' }} />
        <div
          className="truncate block font-medium"
          style={{ minWidth: 0, fontSize: RAIL_VALUE_FONT_SIZE }}
        >
          {milestone ? milestone.name : t('taskList.noMilestone')}
        </div>
        {milestoneDate && (
          <div
            className="text-muted-foreground"
            style={{ flex: 'none', fontSize: RAIL_VALUE_FONT_SIZE }}
          >
            {`· ${milestoneDate}`}
          </div>
        )}
      </Button>
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
      ) : (
        <BoxIcon aria-hidden size={16} style={{ flex: 'none' }} />
      )}
      <div
        style={{ minWidth: 0, fontSize: RAIL_VALUE_FONT_SIZE }}
        className={cn(
          'truncate',
          'block',
          'font-medium',
          projectName ? undefined : 'text-muted-foreground',
        )}
      >
        {projectName ?? t('taskDetail.property.addProject')}
      </div>
    </>
  );

  // The row is the picker's trigger when the task is editable; navigation
  // stays a distinct affordance beside it, so one click never both picks
  // and leaves the page. Read-only keeps the whole row as the link.
  const projectRow = canPickProject ? (
    <div className={'flex items-center gap-1'} style={{ minWidth: 0 }}>
      <DropdownMenu>
        <DropdownMenuTrigger
          nativeButton={false}
          render={
            <div
              className={`flex flex-1 cursor-pointer items-center gap-2 ${styles.railRow} ${styles.interactiveControl}`}
              style={{ minWidth: 0 }}
              title={projectPending ? undefined : (projectName ?? t('taskDetail.noProject'))}
            >
              {projectValue}
            </div>
          }
        />
        <DropdownMenuContent align={'end'} className={'min-w-52'}>
          {projects.map((row) => (
            <DropdownMenuItem key={row.id} onClick={() => changeProject(row.id)}>
              <span className={row.id === taskProjectId ? undefined : 'opacity-0'}>
                <CheckIcon size={16} />
              </span>
              <Avatar
                avatar={row.avatar || undefined}
                name={row.name}
                shape={'square'}
                size={16}
                style={{ flex: 'none' }}
              />
              <span className={'flex-1'} style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.name}
              </span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => changeProject(null)}>
            <span className={!taskProjectId ? undefined : 'opacity-0'}>
              <CheckIcon size={16} />
            </span>
            <span className={'flex-1'}>{t('taskDetail.noProject')}</span>
          </DropdownMenuItem>
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
    <Button
      className={`justify-start gap-2 ${styles.railRow} ${styles.interactiveControl}`}
      title={project.name}
      variant="ghost"
      onClick={() => navigate(`/project/${projectRef}`)}
    >
      {projectValue}
    </Button>
  ) : (
    <Button disabled className={`justify-start gap-2 ${styles.railRow}`} variant="ghost">
      {projectValue}
    </Button>
  );

  return (
    <div
      data-task-project
      className={styles.railSection}
      data-wide-only={!taskProjectId || undefined}
    >
      <span className={styles.railSectionLabel}>{t('taskDetail.project')}</span>
      {projectRow}
      {/* The milestone row only exists where a milestone could: set, or a
          catalog the picker can file under. A project with zero milestones
          shows no row at all — there is nothing to choose and no state to
          claim. */}
      {milestone && project && milestoneRow}
    </div>
  );
});

TaskProjectSection.displayName = 'TaskProjectSection';

export default TaskProjectSection;
