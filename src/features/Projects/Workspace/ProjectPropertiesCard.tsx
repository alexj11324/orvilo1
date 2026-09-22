'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { DropdownMenu, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDownIcon } from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { PROJECT_STATUS_VISUALS, resolveProjectStatus } from '@/components/ExecutionStatus';
import { MUTED_LABEL_COLOR } from '@/features/Projects/sectionLabel';
import { useProjectMembersQuery } from '@/features/Teammates/api/hooks';
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

const styles = createStaticStyles(({ css }) => ({
  // Reference geometry (§3.1): a 90px hard column, `flex: 0 0 auto`. The row
  // gap below is 0 so the value column starts at 1048+90 = 1138 — the same x
  // the candidate reached with 84px + a 10px gap, which is the same number
  // from a different decomposition and diverges as soon as a label is long.
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
  statusTrigger: css`
    cursor: pointer;
    display: inline-flex;
    gap: 4px;
    align-items: center;
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
 * else: how a status *looks* comes from `PROJECT_STATUS_VISUALS`, so one
 * project status can no longer render two different glyphs depending on which
 * surface drew it. This map used to carry its own icon and colour per status —
 * seven of the eight disagreed with the shared spec.
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
  const statusVisual = PROJECT_STATUS_VISUALS[resolveProjectStatus(project.status)];
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
        icon: <Icon icon={PROJECT_STATUS_VISUALS[status].icon} size={14} />,
        key: status,
        label: t(`status.${status}`),
        onClick: () => void changeStatus(status),
      })),
    [changeStatus, t],
  );

  return (
    // 8px between rows on the reference, which puts the row pitch at 36.
    <Flexbox gap={8}>
      <div className={styles.row}>
        <Text className={styles.label} color={MUTED_LABEL_COLOR} fontSize={12}>
          {t('properties.status')}
        </Text>
        <DropdownMenu items={statusItems}>
          <span className={styles.statusTrigger}>
            <Tag
              color={statusVisual.color}
              icon={<Icon icon={statusVisual.icon} size={12} />}
              shape={'round'}
              size={'small'}
            >
              {t(`status.${project.status}`)}
            </Tag>
            {updatingStatus ? null : (
              <Icon icon={ChevronDownIcon} size={12} style={{ opacity: 0.5 }} />
            )}
          </span>
        </DropdownMenu>
      </div>

      <div className={styles.row}>
        <Text className={styles.label} color={MUTED_LABEL_COLOR} fontSize={12}>
          {t('properties.priority')}
        </Text>
        <ProjectPriorityField project={project} />
      </div>

      <div className={styles.row}>
        <Text className={styles.label} color={MUTED_LABEL_COLOR} fontSize={12}>
          {t('properties.lead')}
        </Text>
        <ProjectLeadField project={project} />
      </div>
      <div className={styles.row}>
        <Text className={styles.label} color={MUTED_LABEL_COLOR} fontSize={12}>
          {t('properties.members')}
        </Text>
        {membersEnabled ? (
          <ProjectMembersField projectId={project.id} query={membersSWR} />
        ) : (
          <Text fontSize={12} type={'secondary'}>
            —
          </Text>
        )}
      </div>
      <div className={styles.row}>
        <Text className={styles.label} color={MUTED_LABEL_COLOR} fontSize={12}>
          {t('properties.dates')}
        </Text>
        <ProjectDateFields project={project} />
      </div>

      <div className={styles.row}>
        <Text className={styles.label} color={MUTED_LABEL_COLOR} fontSize={12}>
          {t('properties.teams', { defaultValue: 'Teams' })}
        </Text>
        {teams.length === 0 ? (
          <Text fontSize={12} type={'secondary'}>
            —
          </Text>
        ) : (
          <div className={styles.chipList}>
            {teams.map((team) => (
              <Tag key={team.id} shape={'round'} size={'small'}>
                {team.name}
              </Tag>
            ))}
          </div>
        )}
      </div>

      <div className={styles.row}>
        <Text className={styles.label} color={MUTED_LABEL_COLOR} fontSize={12}>
          {t('properties.labels')}
        </Text>
        <ProjectLabelsField detail={detail} />
      </div>
    </Flexbox>
  );
});

ProjectPropertiesCard.displayName = 'ProjectPropertiesCard';

export default ProjectPropertiesCard;
