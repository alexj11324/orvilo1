'use client';
import { cn } from 'cn';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { resolveProjectStatus } from '@/components/ExecutionStatus';
import { Button } from '@/components/ui/button';
import DropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { projectIssueProgressPercent } from '@/features/Projects/projectIssueProgress';
import { ProjectStatusIcon } from '@/features/Projects/ProjectStatusIcon';
import { useProjectMembersQuery } from '@/features/Teammates/api/hooks';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import TeamIdentity from '@/features/WorkTeams/TeamIdentity';
import { projectService } from '@/services/project';
import type { ProjectDetail } from '@/store/project';
import { useProjectStore } from '@/store/project';

import { ProjectMembersField } from './ProjectMembersField';
import {
  ProjectDateFields,
  ProjectLabelsField,
  ProjectLeadField,
  ProjectPriorityField,
} from './ProjectPlanningFields';
import { PROPERTY_CONTROL_CLASS } from './propertyControl';

const styles = {
  label: 'w-24 flex-none text-xs leading-5 font-normal text-muted-foreground',
  value: 'text-sm leading-5.5 font-normal text-foreground',
  members:
    'flex items-center [&>*]:-ms-1.5 [&>*]:rounded-full [&>*]:border-2 [&>*]:border-card [&>*:first-child]:ms-0',
  row: 'flex min-h-7 items-center',
  chipList: 'flex min-w-0 flex-wrap items-center gap-1',
};

/**
 * Per-status behaviour of the inline status control, and deliberately nothing
 * else. Status colour and the unmeasured states still come from
 * `PROJECT_STATUS_VISUALS`; the active rail trigger below is the one evidenced
 * exception, because the live reference exposes its complete SVG geometry.
 * This map used to carry its own private icon and colour for every status —
 * seven of the eight disagreed with the shared spec without evidence.
 *
 * `writable` is the part that is genuinely local: it is editability, i.e.
 * behaviour, not appearance. Drop it and terminal statuses become settable
 * again.
 */
export const PROJECT_STATUS_META: Record<string, { writable: boolean }> = {
  active: { writable: true },
  archived: { writable: true },
  backlog: { writable: true },
  canceled: { writable: false },
  completed: { writable: false },
  paused: { writable: true },
  planned: { writable: true },
  reviewing: { writable: false },
};

type WritableProjectStatus = 'active' | 'archived' | 'backlog' | 'paused' | 'planned';

const WRITABLE_STATUSES = Object.keys(PROJECT_STATUS_META).filter(
  (status): status is WritableProjectStatus => PROJECT_STATUS_META[status].writable,
);

interface ProjectPropertiesCardProps {
  detail: ProjectDetail;
  projectId: string;
}

/**
 * Linear-style property column for the project overview: dense label/value
 * rows for the metadata a reviewer scans first (status, members, progress,
 * visibility, created). Status is editable inline where the lifecycle allows.
 */
const ProjectPropertiesCard = memo<ProjectPropertiesCardProps>(({ detail, projectId }) => {
  const { t } = useTranslation('project');
  const detailSWR = useProjectStore((s) => s.useFetchProjectDetail)(projectId);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const workspaceId = useActiveWorkspaceId();
  const membersEnabled = !!workspaceId;
  const membersSWR = useProjectMembersQuery(projectId, membersEnabled);

  const project = detail.project;
  const resolvedStatus = resolveProjectStatus(project.status);
  const teams = detail.teams ?? [];

  const changeStatus = useCallback(
    async (status: WritableProjectStatus) => {
      if (updatingStatus || status === project.status) return;
      setUpdatingStatus(true);
      try {
        await projectService.updateStatus(project.id, status);
        await detailSWR.mutate();
      } finally {
        setUpdatingStatus(false);
      }
    },
    [detailSWR, project.id, project.status, updatingStatus],
  );

  const statusItems = useMemo(
    () =>
      WRITABLE_STATUSES.map((status) => ({
        icon: <ProjectStatusIcon size={16} status={status} />,
        key: status,
        label: t(`status.${status}`),
        onClick: () => void changeStatus(status),
      })),
    [changeStatus, t],
  );

  return (
    // 8px between rows on the reference, which puts the row pitch at 36.
    <div className="flex flex-col gap-2">
      <div className={styles.row}>
        <span
          className={cn(cn('text-sm', styles.label), 'text-xs leading-5 text-muted-foreground')}
        >
          {t('properties.status')}
        </span>
        <DropdownMenu items={statusItems}>
          <Button
            aria-label={t('properties.status')}
            className={PROPERTY_CONTROL_CLASS}
            disabled={updatingStatus || !detail.capabilities?.canEdit}
            size="sm"
            variant="ghost"
          >
            <ProjectStatusIcon
              percent={projectIssueProgressPercent(detail.tasks) ?? 0}
              size={16}
              status={resolvedStatus}
            />
            <span>{t(`status.${project.status}`)}</span>
          </Button>
        </DropdownMenu>
      </div>
      <div className={styles.row}>
        <span
          className={cn(cn('text-sm', styles.label), 'text-xs leading-5 text-muted-foreground')}
        >
          {t('properties.priority')}
        </span>
        <ProjectPriorityField project={project} />
      </div>
      <div className={styles.row}>
        <span
          className={cn(cn('text-sm', styles.label), 'text-xs leading-5 text-muted-foreground')}
        >
          {t('properties.lead')}
        </span>
        <ProjectLeadField project={project} />
      </div>
      <div className={styles.row}>
        <span
          className={cn(cn('text-sm', styles.label), 'text-xs leading-5 text-muted-foreground')}
        >
          {t('properties.members')}
        </span>
        {membersEnabled ? (
          <ProjectMembersField
            canManage={detail.capabilities?.canManage}
            projectId={project.id}
            projectVisibility={project.visibility}
            query={membersSWR}
            onChanged={() =>
              detailSWR
                .mutate()
                .catch((error) => console.error('Failed to refresh project capabilities', error))
            }
          />
        ) : (
          <span className="text-muted-foreground text-xs leading-5">—</span>
        )}
      </div>
      <div className={styles.row}>
        <span
          className={cn(cn('text-sm', styles.label), 'text-xs leading-5 text-muted-foreground')}
        >
          {t('properties.dates')}
        </span>
        <ProjectDateFields project={project} />
      </div>
      <div className={styles.row}>
        <span
          className={cn(cn('text-sm', styles.label), 'text-xs leading-5 text-muted-foreground')}
        >
          {t('properties.teams', { defaultValue: 'Teams' })}
        </span>
        {teams.length === 0 ? (
          <span className="text-muted-foreground text-xs leading-5">—</span>
        ) : (
          <div className={styles.chipList}>
            {teams.map((team) => (
              <WorkspaceLink
                className="group/project-team inline-flex min-w-0 rounded-(--radius-input) focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2"
                key={team.id}
                to={`/teams/${team.id}`}
              >
                <span className="inline-flex h-7 max-w-full shrink-0 items-center gap-2 rounded-(--radius-input) px-1.5 py-0 text-sm leading-5.5 font-medium text-foreground group-hover/project-team:bg-accent group-focus-visible/project-team:bg-accent">
                  <TeamIdentity
                    color={team.color}
                    id={team.id}
                    letter={(team.key || team.name).slice(0, 1)}
                    size={14}
                  />
                  {team.name}
                </span>
              </WorkspaceLink>
            ))}
          </div>
        )}
      </div>
      <div className={styles.row}>
        <span
          className={cn(cn('text-sm', styles.label), 'text-xs leading-5 text-muted-foreground')}
        >
          {t('properties.labels')}
        </span>
        <ProjectLabelsField detail={detail} />
      </div>
    </div>
  );
});

ProjectPropertiesCard.displayName = 'ProjectPropertiesCard';

export default ProjectPropertiesCard;
