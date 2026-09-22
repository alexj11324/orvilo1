'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Button, DropdownMenu, Tag, Text } from '@lobehub/ui/base-ui';
import { Progress } from 'antd';
import { createStaticStyles, cssVar } from 'antd-style';
import dayjs from 'dayjs';
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
import Avatar from '@/components/Avatar';
import AssigneeUserAvatar from '@/features/AgentTasks/features/AssigneeUserAvatar';
import { useProjectMembersQuery } from '@/features/Teammates/api/hooks';
import { useTeammatesEnabled } from '@/features/Teammates/useTeammatesEnabled';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { projectService } from '@/services/project';
import type { ProjectDetail } from '@/store/project';
import { useProjectStore } from '@/store/project';

import { formatProjectDate } from '../projectPlanningDate';

const styles = createStaticStyles(({ css }) => ({
  label: css`
    flex: none;
    width: 84px;
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
  /** null when the goal count is unknown or zero — renders “—”, never a
      misleading 0%. */
  goalProgress: number | null;
  projectId: string;
}

/**
 * Linear-style property column for the project overview: dense label/value
 * rows for the metadata a reviewer scans first (status, members, progress,
 * visibility, created). Status is editable inline where the lifecycle allows.
 */
const ProjectPropertiesCard = memo<ProjectPropertiesCardProps>(
  ({ detail, goalProgress, projectId }) => {
    const { t } = useTranslation('project');
    const navigate = useWorkspaceAwareNavigate();
    const detailSWR = useProjectStore((s) => s.useFetchProjectDetail)(projectId);
    const [updatingStatus, setUpdatingStatus] = useState(false);
    const workspaceId = useActiveWorkspaceId();
    const membersEnabled = useTeammatesEnabled() && !!workspaceId;
    const membersSWR = useProjectMembersQuery(projectId, membersEnabled);

    const project = detail.project;
    const statusMeta = PROJECT_STATUS_META[project.status] ?? PROJECT_STATUS_META.backlog;
    const members = membersSWR.data ?? [];
    const labels = detail.labels ?? [];
    const dependencies = detail.dependencies ?? [];
    const priorityLabel =
      {
        0: 'create.priority.noPriority',
        1: 'create.priority.urgent',
        2: 'create.priority.high',
        3: 'create.priority.normal',
        4: 'create.priority.low',
      }[project.priority ?? 0] ?? 'create.priority.noPriority';

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
          <Text fontSize={12}>{t(priorityLabel)}</Text>
        </div>

        <div className={styles.row}>
          <Text className={styles.label} fontSize={12} type={'secondary'}>
            {t('properties.lead')}
          </Text>
          {project.leadUserId ? (
            <AssigneeUserAvatar userId={project.leadUserId} />
          ) : (
            <Text fontSize={12} type={'secondary'}>
              {t('properties.noLead')}
            </Text>
          )}
        </div>
        <div className={styles.row}>
          <Text className={styles.label} fontSize={12} type={'secondary'}>
            {t('properties.dates')}
          </Text>
          <Text fontSize={12}>
            {project.startDate
              ? formatProjectDate(project.startDate, project.startDatePrecision ?? 'day')
              : '—'}
            {' → '}
            {project.targetDate
              ? formatProjectDate(project.targetDate, project.targetDatePrecision ?? 'day')
              : '—'}
          </Text>
        </div>

        <div className={styles.row}>
          <Text className={styles.label} fontSize={12} type={'secondary'}>
            {t('properties.labels')}
          </Text>
          {labels.length === 0 ? (
            <Text fontSize={12} type={'secondary'}>
              —
            </Text>
          ) : (
            <div className={styles.chipList}>
              {labels.map((label) => (
                <Tag key={label.id} shape={'round'} size={'small'}>
                  {label.name}
                </Tag>
              ))}
            </div>
          )}
        </div>

        <div className={styles.row}>
          <Text className={styles.label} fontSize={12} type={'secondary'}>
            {t('properties.dependencies')}
          </Text>
          {dependencies.length === 0 ? (
            <Text fontSize={12} type={'secondary'}>
              —
            </Text>
          ) : (
            <div className={styles.chipList}>
              {dependencies.map((dependency) => {
                const reference = dependency.project.slug ?? dependency.project.id;
                const relation = t(`create.dependencies.${dependency.type}`);

                return (
                  <Button
                    key={`${dependency.type}-${dependency.project.id}`}
                    size={'small'}
                    type={'text'}
                    onClick={() => navigate(`/project/${reference}`)}
                  >
                    {relation} · {dependency.project.name}
                  </Button>
                );
              })}
            </div>
          )}
        </div>

        {membersEnabled && (
          <div className={styles.row}>
            <Text className={styles.label} fontSize={13} type={'secondary'}>
              {t('properties.members')}
            </Text>
            {members.length === 0 ? (
              <Text fontSize={13} type={'secondary'}>
                —
              </Text>
            ) : (
              <Flexbox horizontal align={'center'} gap={8}>
                <div className={styles.members}>
                  {members.slice(0, 5).map((member) => (
                    <Avatar
                      avatar={member.user?.avatar ?? undefined}
                      key={member.userId}
                      size={20}
                      title={member.user?.fullName || member.user?.username || undefined}
                    />
                  ))}
                </div>
                {members.length > 5 && (
                  <Text fontSize={12} type={'secondary'}>
                    +{members.length - 5}
                  </Text>
                )}
              </Flexbox>
            )}
          </div>
        )}

        <div className={styles.row}>
          <Text className={styles.label} fontSize={13} type={'secondary'}>
            {t('properties.progress')}
          </Text>
          <Flexbox horizontal align={'center'} flex={1} gap={8}>
            {goalProgress === null ? (
              <Text fontSize={13} type={'secondary'}>
                —
              </Text>
            ) : (
              <>
                <Progress percent={goalProgress} showInfo={false} size={'small'} />
                <Text
                  fontSize={12}
                  style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                  type={'secondary'}
                >
                  {goalProgress}%
                </Text>
              </>
            )}
          </Flexbox>
        </div>

        <div className={styles.row}>
          <Text className={styles.label} fontSize={13} type={'secondary'}>
            {t('properties.visibility')}
          </Text>
          <Text fontSize={13}>
            {t(`properties.visibilityValue.${project.visibility}`, {
              defaultValue: project.visibility,
            })}
          </Text>
        </div>

        {project.createdAt && (
          <div className={styles.row}>
            <Text className={styles.label} fontSize={13} type={'secondary'}>
              {t('properties.created')}
            </Text>
            <Text fontSize={13}>{dayjs(project.createdAt).format('MMM D, YYYY')}</Text>
          </div>
        )}
      </Flexbox>
    );
  },
);

ProjectPropertiesCard.displayName = 'ProjectPropertiesCard';

export default ProjectPropertiesCard;
