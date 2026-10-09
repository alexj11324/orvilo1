'use client';
import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { resolveProjectStatus } from '@/components/ExecutionStatus';
import { Button } from '@/components/ui/button';
import DropdownMenu from '@/features/NavPanel/components/SidebarDropdownMenu';
import { projectIssueProgressPercent } from '@/features/Projects/projectIssueProgress';
import { ProjectStatusIcon } from '@/features/Projects/ProjectStatusIcon';
import { MUTED_LABEL_COLOR } from '@/features/Projects/sectionLabel';
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
import { PROPERTY_CONTROL_CLASS, PROPERTY_LINK_CLASS } from './propertyControl';

const styles = createStaticStyles(({ css }) => ({
  // Reference geometry (§3.1): a 90px hard column, `flex: 0 0 auto`, with no gap
  // after it. The two are one number — the reference's value column starts at
  // 1048 + 90 = 1138 — and this file only owns the `90` and the `0`: the `1048`
  // is the card's content box, which the rail card's start inset sets
  // (`Layout/ProjectSidePanel`, where the 4px that moved it there is recorded).
  //
  // Reached as that sum, not as a total. The card used to run 84px with a 10px
  // row gap, which also lands on 1138 — 1044 + 84 + 10 — so both sides agreed on
  // the number while disagreeing on its parts, and the agreement held only while
  // every label fitted in 84px. That is why the column is a width and a gap
  // rather than an x: a shared total is not a shared structure.
  label: css`
    flex: 0 0 auto;
    width: 90px;
    font-weight: 450;
  `,
  value: css`
    font-weight: 450;
    color: ${cssVar.colorText};
  `,
  members: css`
    display: flex;
    align-items: center;

    > * {
      margin-inline-start: -6px;
      border: 2px solid ${cssVar.colorBgContainer};
      border-radius: 50%;

      &:first-child {
        margin-inline-start: 0;
      }
    }
  `,
  row: css`
    display: flex;
    align-items: center;
    min-height: 28px;
  `,
  chipList: css`
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    align-items: center;

    min-width: 0;
  `,
}));

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
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div className={styles.row}>
        <span
          className={cn('text-sm', styles.label)}
          style={{ fontSize: 12, color: MUTED_LABEL_COLOR }}
        >
          {t('properties.status')}
        </span>
        <DropdownMenu items={statusItems}>
          <Button
            aria-label={t('properties.status')}
            className={PROPERTY_CONTROL_CLASS}
            disabled={updatingStatus}
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
          className={cn('text-sm', styles.label)}
          style={{ fontSize: 12, color: MUTED_LABEL_COLOR }}
        >
          {t('properties.priority')}
        </span>
        <ProjectPriorityField project={project} />
      </div>
      <div className={styles.row}>
        <span
          className={cn('text-sm', styles.label)}
          style={{ fontSize: 12, color: MUTED_LABEL_COLOR }}
        >
          {t('properties.lead')}
        </span>
        <ProjectLeadField project={project} />
      </div>
      <div className={styles.row}>
        <span
          className={cn('text-sm', styles.label)}
          style={{ fontSize: 12, color: MUTED_LABEL_COLOR }}
        >
          {t('properties.members')}
        </span>
        {membersEnabled ? (
          <ProjectMembersField projectId={project.id} query={membersSWR} />
        ) : (
          <span className="text-sm text-muted-foreground" style={{ fontSize: 12 }}>
            —
          </span>
        )}
      </div>
      <div className={styles.row}>
        <span
          className={cn('text-sm', styles.label)}
          style={{ fontSize: 12, color: MUTED_LABEL_COLOR }}
        >
          {t('properties.dates')}
        </span>
        <ProjectDateFields project={project} />
      </div>
      <div className={styles.row}>
        <span
          className={cn('text-sm', styles.label)}
          style={{ fontSize: 12, color: MUTED_LABEL_COLOR }}
        >
          {t('properties.teams', { defaultValue: 'Teams' })}
        </span>
        {teams.length === 0 ? (
          <span className="text-sm text-muted-foreground" style={{ fontSize: 12 }}>
            —
          </span>
        ) : (
          <div className={styles.chipList}>
            {teams.map((team) => (
              <WorkspaceLink className={PROPERTY_LINK_CLASS} key={team.id} to={`/teams/${team.id}`}>
                <TeamIdentity
                  color={team.color}
                  id={team.id}
                  letter={(team.key || team.name).slice(0, 1)}
                  size={14}
                />
                {team.name}
              </WorkspaceLink>
            ))}
          </div>
        )}
      </div>
      <div className={styles.row}>
        <span
          className={cn('text-sm', styles.label)}
          style={{ fontSize: 12, color: MUTED_LABEL_COLOR }}
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
