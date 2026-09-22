'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { DropdownMenu, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  ArchiveIcon,
  CheckCircle2Icon,
  ChevronDownIcon,
  CircleDashedIcon,
  CircleDotIcon,
  CircleSlashIcon,
  PauseCircleIcon,
  PlayCircleIcon,
} from 'lucide-react';
import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
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
  label: css`
    flex: none;
    width: 84px;
    font-weight: 450;
    color: ${cssVar.colorTextSecondary};
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
    gap: 10px;
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

export const PROJECT_STATUS_META: Record<
  string,
  { color?: string; icon: typeof CircleDotIcon; writable: boolean }
> = {
  active: { color: 'processing', icon: PlayCircleIcon, writable: true },
  archived: { icon: ArchiveIcon, writable: true },
  backlog: { icon: CircleDashedIcon, writable: true },
  canceled: { icon: CircleSlashIcon, writable: false },
  completed: { color: 'success', icon: CheckCircle2Icon, writable: false },
  paused: { color: 'warning', icon: PauseCircleIcon, writable: true },
  planned: { icon: CircleDotIcon, writable: true },
  reviewing: { color: 'warning', icon: CircleDotIcon, writable: false },
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
  const statusMeta = PROJECT_STATUS_META[project.status] ?? PROJECT_STATUS_META.backlog;
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
        icon: <Icon icon={PROJECT_STATUS_META[status].icon} size={14} />,
        key: status,
        label: t(`acceptance.status.${status}`),
        onClick: () => void changeStatus(status),
      })),
    [changeStatus, t],
  );

  return (
    <Flexbox gap={6}>
      <div className={styles.row}>
        <Text className={styles.label} fontSize={13} type={'secondary'}>
          {t('properties.status')}
        </Text>
        <DropdownMenu items={statusItems}>
          <span className={styles.statusTrigger}>
            <Tag
              color={statusMeta.color}
              icon={<Icon icon={statusMeta.icon} size={12} />}
              shape={'round'}
              size={'small'}
            >
              {t(`acceptance.status.${project.status}`)}
            </Tag>
            {updatingStatus ? null : (
              <Icon icon={ChevronDownIcon} size={12} style={{ opacity: 0.5 }} />
            )}
          </span>
        </DropdownMenu>
      </div>

      <div className={styles.row}>
        <Text className={styles.label} fontSize={12} type={'secondary'}>
          {t('properties.priority')}
        </Text>
        <ProjectPriorityField project={project} />
      </div>

      <div className={styles.row}>
        <Text className={styles.label} fontSize={12} type={'secondary'}>
          {t('properties.lead')}
        </Text>
        <ProjectLeadField project={project} />
      </div>
      <div className={styles.row}>
        <Text className={styles.label} fontSize={12} type={'secondary'}>
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
        <Text className={styles.label} fontSize={12} type={'secondary'}>
          {t('properties.dates')}
        </Text>
        <ProjectDateFields project={project} />
      </div>

      <div className={styles.row}>
        <Text className={styles.label} fontSize={12} type={'secondary'}>
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
        <Text className={styles.label} fontSize={12} type={'secondary'}>
          {t('properties.labels')}
        </Text>
        <ProjectLabelsField detail={detail} />
      </div>

      {detail.milestones && detail.milestones.length > 0 && (
        <div className={styles.row}>
          <Text className={styles.label} fontSize={12} type={'secondary'}>
            {t('overview.milestones', { defaultValue: 'Milestones' })}
          </Text>
          <div className={styles.chipList}>
            {detail.milestones.map((milestone) => (
              <Tag key={milestone.id} shape={'round'} size={'small'}>
                {milestone.name}
              </Tag>
            ))}
          </div>
        </div>
      )}
    </Flexbox>
  );
});

ProjectPropertiesCard.displayName = 'ProjectPropertiesCard';

export default ProjectPropertiesCard;
