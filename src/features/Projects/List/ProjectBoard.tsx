'use client';
import type { ProjectHealth } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { resolveProjectStatus } from '@/components/ExecutionStatus';
import { PriorityIcon, resolvePriorityLevel } from '@/components/PriorityIcon';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PROJECT_HEALTH_META, ProjectHealthIcon } from '@/features/Projects/healthMeta';
import { ProjectIcon } from '@/features/Projects/ProjectIcon';
import { ProjectStatusIcon } from '@/features/Projects/ProjectStatusIcon';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import type { ProjectListItem } from '@/store/project';

import type { ProjectListDisplayOptions, ProjectListGroup } from './displayOptions';
import ProjectMilestoneChip from './MilestoneChip';

const styles = createStaticStyles(({ css }) => ({
  board: css`
    overflow-x: auto;
    overscroll-behavior: contain;
    display: flex;
    gap: 12px;
    align-items: flex-start;

    padding-block-end: 8px;
  `,
  card: css`
    position: relative;

    display: flex;
    flex-direction: column;
    gap: 6px;

    padding: 10px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    color: inherit;

    background: ${cssVar.colorBgContainer};

    &:hover {
      border-color: ${cssVar.colorBorder};
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  cardMeta: css`
    display: flex;
    gap: 8px;
    align-items: center;

    font-size: 11px;
    color: ${cssVar.colorTextTertiary};
    white-space: nowrap;
  `,
  column: css`
    flex: none;
    width: 264px;
    border-radius: 8px;
    background: ${cssVar.colorFillQuaternary};
  `,
  columnBody: css`
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px;
  `,
  columnHeader: css`
    display: flex;
    gap: 6px;
    align-items: center;

    padding-block: 8px;
    padding-inline: 10px;
  `,
  link: css`
    position: absolute;
    inset: 0;
    border-radius: inherit;
  `,
}));

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
              <span className="text-sm" style={{ fontSize: 13, fontWeight: 500 }}>
                {t(`status.${status}`)}
              </span>
              <span className="text-sm text-muted-foreground" style={{ fontSize: 12 }}>
                {group.items.length}
              </span>
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
                    <div
                      className="flex flex-row"
                      style={{ alignItems: 'center', gap: 8, minWidth: 0 }}
                    >
                      {project.avatar && project.avatar !== '📦' ? (
                        <Avatar
                          avatar={project.avatar}
                          name={project.name}
                          shape="square"
                          size={16}
                        />
                      ) : (
                        <ProjectIcon color={cssVar.colorTextTertiary} size={14} />
                      )}
                      <span className="text-sm truncate" style={{ fontSize: 13, fontWeight: 500 }}>
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
                        <span>{dayjs(project.targetDate).format('MMM D')}</span>
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
            <ProjectHealthIcon health={valid} size={12} />
          </span>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
});

ProjectHealthDot.displayName = 'ProjectHealthDot';

export default ProjectBoard;
