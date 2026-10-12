'use client';
import type { ProjectHealth } from '@orvilo/types';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { resolveProjectStatus } from '@/components/ExecutionStatus';
import { PriorityIcon, resolvePriorityLevel } from '@/components/PriorityIcon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PROJECT_HEALTH_META, ProjectHealthIcon } from '@/features/Projects/healthMeta';
import { ProjectIcon } from '@/features/Projects/ProjectIcon';
import { formatProjectDay } from '@/features/Projects/projectPlanningDate';
import { ProjectStatusIcon } from '@/features/Projects/ProjectStatusIcon';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import type { ProjectListItem } from '@/store/project';

import type { ProjectListDisplayOptions, ProjectListGroup } from './displayOptions';
import ProjectMilestoneChip from './MilestoneChip';

const styles = {
  board: 'flex items-start gap-3 overflow-x-auto overscroll-contain pbe-2',
  card: 'relative flex flex-col gap-1.5 rounded-(--radius-card) border border-divider bg-card p-4 text-foreground hover:border-border hover:bg-fill-quaternary',
  cardMeta: 'flex items-center gap-2 text-xs leading-5 text-foreground-tertiary whitespace-nowrap',
  column: 'w-66 flex-none rounded-(--radius-card) bg-fill-quaternary',
  columnBody: 'flex flex-col gap-1.5 p-1.5',
  columnHeader: 'flex items-center gap-1.5 px-2.5 py-2',
  link: 'absolute inset-0 rounded-(--radius-card)',
};

interface ProjectBoardProps {
  groups: ProjectListGroup<ProjectListItem>[];
  leadAvatar: (userId: string) => string | undefined;
  leadName: (userId: string) => string | undefined;
  properties: ProjectListDisplayOptions['properties'];
}

/**
 * Board layout for `/projects` — the reference's second Layout option.
 * Columns follow project-status workflow order; cards are read-only
 * (status changes happen on the project surface, like the saved-view board).
 */
const ProjectBoard = memo<ProjectBoardProps>(({ groups, leadAvatar, leadName, properties }) => {
  const { t } = useTranslation('project');
  return (
    <div className={styles.board}>
      {groups.map((group) => {
        const status = resolveProjectStatus(group.key.replace(/^status:/, ''));
        return (
          <div className={styles.column} key={group.key}>
            <div className={styles.columnHeader}>
              <ProjectStatusIcon size={16} status={status} />
              <span className="text-sm leading-5.5 font-medium">{t(`status.${status}`)}</span>
              <span className="text-muted-foreground text-xs leading-5">{group.items.length}</span>
            </div>
            <div className={styles.columnBody}>
              {group.items.map((project) => {
                const priority = resolvePriorityLevel(project.priority);
                return (
                  <div className={styles.card} key={project.id}>
                    <WorkspaceLink
                      aria-label={project.name}
                      className={styles.link}
                      to={`/project/${project.slug ?? project.id}`}
                    />
                    <div className="flex flex-row items-center gap-2 min-w-0">
                      {project.avatar && project.avatar !== '📦' ? (
                        <Avatar
                          avatar={project.avatar}
                          name={project.name}
                          shape="square"
                          size={16}
                        />
                      ) : (
                        <ProjectIcon color="var(--foreground-tertiary)" size={14} />
                      )}
                      <span className="truncate text-sm leading-5.5 font-medium">
                        {project.name}
                      </span>
                    </div>
                    {properties.milestones ? <ProjectMilestoneChip projectId={project.id} /> : null}
                    <div className={styles.cardMeta}>
                      {properties.health && project.health ? (
                        <ProjectHealthDot health={project.health} />
                      ) : null}
                      {properties.priority ? (
                        <PriorityIcon
                          aria-label={t(`create.priority.${PROJECT_PRIORITY_KEY[priority]}`)}
                          priority={priority}
                          role="img"
                          size={14}
                        />
                      ) : null}
                      {properties.lead && project.leadUserId ? (
                        <Avatar
                          avatar={leadAvatar(project.leadUserId)}
                          name={leadName(project.leadUserId) ?? project.leadUserId}
                          shape="circle"
                          size={16}
                        />
                      ) : null}
                      {properties.targetDate && project.targetDate ? (
                        <span>{formatProjectDay(project.targetDate)}</span>
                      ) : null}
                      {properties.issues && typeof project.taskCount === 'number' ? (
                        <span>{project.taskCount}</span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
});

ProjectBoard.displayName = 'ProjectBoard';

const PROJECT_PRIORITY_KEY = {
  0: 'noPriority',
  1: 'urgent',
  2: 'high',
  3: 'normal',
  4: 'low',
} as const;

const ProjectHealthDot = memo<{ health: string }>(({ health }) => {
  const { t } = useTranslation('project');
  const valid = health in PROJECT_HEALTH_META ? (health as ProjectHealth) : null;
  const label = valid ? t(PROJECT_HEALTH_META[valid].key) : t('list.health.noUpdates');
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span aria-label={label} role="img">
            <ProjectHealthIcon health={valid} size={16} />
          </span>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
});

ProjectHealthDot.displayName = 'ProjectHealthDot';

export default ProjectBoard;
