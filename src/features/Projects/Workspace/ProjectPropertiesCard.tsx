'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { DropdownMenu, Tag, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDownIcon } from 'lucide-react';
import { memo, useCallback, useId, useMemo, useState } from 'react';
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

const ACTIVE_STATUS_PERIMETER =
  'M2.95778 3.02069L5.70777 1.36023C6.50244 0.88041 7.49756 0.88041 8.29223 1.36024L11.0422 3.02074C11.7918 3.47336 12.25 4.2852 12.25 5.16086V8.84803C12.25 9.7251 11.7904 10.5381 11.0388 10.9902L8.29114 12.6433C7.49693 13.1211 6.50355 13.1203 5.71011 12.6412L2.95775 10.9792C2.20815 10.5266 1.75 9.7148 1.75 8.83911V5.16082C1.75 4.28516 2.20816 3.47332 2.95778 3.02069Z';
const ACTIVE_STATUS_MASK =
  'M8.3779 4.74233C8.14438 4.60607 7.85562 4.60607 7.6221 4.74233L5.37209 6.05513C5.14168 6.18957 5 6.4363 5 6.70311V9.34216C5 9.60897 5.14168 9.85573 5.37209 9.99016L7.6221 11.303C7.85562 11.4392 8.14438 11.4392 8.3779 11.303L10.6279 9.99016C10.8583 9.85573 11 9.60897 11 9.34216V6.70311C11 6.4363 10.8583 6.18957 10.6279 6.05513L8.3779 4.74233Z';

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
  const activeStatusMaskId = `project-active-status-${useId().replaceAll(':', '')}`;
  const detailSWR = useProjectStore((s) => s.useFetchProjectDetail)(projectId);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const workspaceId = useActiveWorkspaceId();
  const membersEnabled = !!workspaceId;
  const membersSWR = useProjectMembersQuery(projectId, membersEnabled);

  const project = detail.project;
  const resolvedStatus = resolveProjectStatus(project.status);
  const statusVisual = PROJECT_STATUS_VISUALS[resolvedStatus];
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
              shape={'round'}
              size={'small'}
              icon={
                resolvedStatus === 'active' ? (
                  <svg
                    aria-hidden="true"
                    fill="none"
                    height={16}
                    stroke="none"
                    style={{ color: statusVisual.color, flex: 'none' }}
                    viewBox="-1 -1 16 16"
                    width={16}
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d={ACTIVE_STATUS_PERIMETER}
                      fill="none"
                      stroke="currentColor"
                      strokeDasharray="3.14 0"
                      strokeDashoffset={1}
                      strokeLinejoin="bevel"
                      strokeWidth={1.5}
                    />
                    <g mask={`url(#${activeStatusMaskId})`}>
                      <circle
                        cx={7}
                        cy={7}
                        fill="none"
                        r={4}
                        stroke="currentColor"
                        strokeDasharray="9.453493333333332 25.12"
                        strokeWidth={8}
                        transform="rotate(-90) translate(-14, 0)"
                      />
                    </g>
                    <mask id={activeStatusMaskId} maskUnits="userSpaceOnUse">
                      <path d={ACTIVE_STATUS_MASK} fill="white" transform="translate(-1, -1)" />
                    </mask>
                  </svg>
                ) : (
                  <Icon icon={statusVisual.icon} size={12} />
                )
              }
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
