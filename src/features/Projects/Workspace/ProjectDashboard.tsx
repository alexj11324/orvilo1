'use client';

import { Empty, Flexbox, Icon } from '@lobehub/ui';
import { Button, Tag, Text } from '@lobehub/ui/base-ui';
import type { WorkSummaryItem } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import {
  CheckCircle2Icon,
  CircleDotIcon,
  Clock3Icon,
  FlagIcon,
  PackageOpenIcon,
  TargetIcon,
} from 'lucide-react';
import { memo, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import AsyncError from '@/components/AsyncError';
import { ArticleSkeleton } from '@/components/Skeleton';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavItem from '@/features/NavPanel/components/NavItem';
import { getProjectGoalsPath, getProjectTasksPath } from '@/features/Projects/Layout/navigation';
import OrchestrationPolicyCard from '@/features/Projects/Workspace/OrchestrationPolicyCard';
import WorkSummaryCard from '@/features/Work/WorkSummaryCard';
import { useOpenWork } from '@/features/WorkGallery/useOpenWork';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import { useClientDataSWR } from '@/libs/swr';
import { workKeys } from '@/libs/swr/keys';
import { workService } from '@/services/work';
import { goalSelectors, useGoalStore } from '@/store/goal';
import type { ProjectDetail } from '@/store/project';

import { formatProjectDate } from '../projectPlanningDate';

const styles = createStaticStyles(({ css }) => ({
  main: css`
    min-width: 0;
    margin-block-start: 24px;
  `,
  milestone: css`
    padding-block: 6px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: 0;
    }
  `,
  section: css`
    padding-block: 16px;
    border-block-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  works: css`
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;

    @media (width <= 760px) {
      grid-template-columns: 1fr;
    }
  `,
}));

const TERMINAL_STATUSES = new Set<string>(['canceled', 'completed']);
interface ProjectDashboardProps {
  detail: ProjectDetail;
  projectId: string;
}

const SectionTitle = memo<{
  action?: string;
  count?: number;
  onAction?: () => void;
  title: string;
}>(({ action, count, onAction, title }) => (
  <Flexbox horizontal align={'center'} justify={'space-between'}>
    <Flexbox horizontal align={'center'} gap={7}>
      <Text fontSize={16} weight={600}>
        {title}
      </Text>
      {count !== undefined && <Tag shape={'round'}>{count}</Tag>}
    </Flexbox>
    {action && (
      <Button size={'small'} type={'text'} onClick={onAction}>
        {action}
      </Button>
    )}
  </Flexbox>
));

const ProjectDashboard = memo<ProjectDashboardProps>(({ detail, projectId }) => {
  const { t } = useTranslation('project');
  const [policyOpen, setPolicyOpen] = useState(false);
  const navigate = useWorkspaceAwareNavigate();
  const openWork = useOpenWork();
  const workspaceId = useActiveWorkspaceId();
  const goalScope = `project:${projectId}`;
  const goals = useGoalStore(goalSelectors.goalList(goalScope));
  const goalSWR = useGoalStore((s) => s.useFetchGoals)(undefined, projectId);
  const projectReference = detail.project.slug ?? projectId;
  const workSWR = useClientDataSWR(workKeys.workspace(workspaceId, `project:${projectId}`), () =>
    workService.listByWorkspace({
      limit: 4,
      // Scoped by the project's own Work associations, not by its coordinator: a
      // project with no coordinator configured still has its Works bound in
      // `project_works`, and filtering by `originAgentId` reported those as none.
      projectId,
    }),
  );

  const tasks = detail.tasks ?? [];
  const milestones = detail.milestones ?? [];
  const activeTasks = tasks.filter((task) => !TERMINAL_STATUSES.has(task.status)).slice(0, 5);
  const completedGoals = goals.filter(({ goal }) => goal.status === 'achieved').length;
  const works = workSWR.data?.items ?? [];
  const goalPreview = useMemo(() => goals.slice(0, 3), [goals]);

  return (
    <Flexbox className={styles.main} gap={24}>
      <Flexbox gap={10}>
        <SectionTitle
          action={t('overview.viewAllGoals', { defaultValue: 'View all' })}
          count={goals.length}
          title={t('sections.goals')}
          onAction={() => navigate(getProjectGoalsPath(projectReference))}
        />
        {goalSWR.error ? (
          <AsyncError
            error={goalSWR.error}
            variant={'inline'}
            onRetry={() => void goalSWR.mutate()}
          />
        ) : goalSWR.isLoading && goals.length === 0 ? (
          <ArticleSkeleton rows={4} />
        ) : goals.length === 0 ? (
          <Text fontSize={13} style={{ paddingBlock: 4 }} type={'secondary'}>
            {t('overview.goalsEmpty')}
          </Text>
        ) : (
          <Flexbox gap={0}>
            {goalPreview.map(({ goal }) => (
              <Flexbox
                horizontal
                align={'center'}
                className={styles.milestone}
                gap={10}
                key={goal.id}
              >
                <Icon
                  color={goal.status === 'achieved' ? cssVar.colorSuccess : undefined}
                  icon={goal.status === 'achieved' ? CheckCircle2Icon : TargetIcon}
                  size={15}
                />
                <Text ellipsis fontSize={13} style={{ flex: 1, minWidth: 0 }} weight={500}>
                  {goal.title}
                </Text>
                <Text fontSize={12} type={'secondary'}>
                  {t(`goals.status.${goal.status}`, { defaultValue: goal.status })}
                </Text>
              </Flexbox>
            ))}
            {goals.length > goalPreview.length && (
              <Text fontSize={12} style={{ paddingBlock: 4 }} type={'secondary'}>
                {t('overview.goalCount', { completed: completedGoals, total: goals.length })}
              </Text>
            )}
          </Flexbox>
        )}
      </Flexbox>

      <Flexbox className={styles.section} gap={10}>
        <SectionTitle count={milestones.length} title={t('overview.milestones')} />
        {milestones.length === 0 ? (
          <Text fontSize={13} style={{ paddingBlock: 4 }} type={'secondary'}>
            {t('overview.milestonesEmpty')}
          </Text>
        ) : (
          <Flexbox gap={0}>
            {milestones.map((milestone) => (
              <Flexbox
                horizontal
                align={'center'}
                className={styles.milestone}
                gap={10}
                key={milestone.id}
              >
                <Icon icon={FlagIcon} size={15} />
                <Text ellipsis fontSize={13} style={{ flex: 1, minWidth: 0 }} weight={500}>
                  {milestone.name}
                </Text>
                {milestone.date && (
                  <Text fontSize={12} type={'secondary'}>
                    {formatProjectDate(milestone.date)}
                  </Text>
                )}
              </Flexbox>
            ))}
          </Flexbox>
        )}
      </Flexbox>

      <Flexbox className={styles.section} gap={8}>
        <SectionTitle
          action={t('overview.viewAllTasks')}
          count={activeTasks.length}
          title={t('overview.activeTasks')}
          onAction={() => navigate(getProjectTasksPath(projectReference))}
        />
        {activeTasks.length === 0 ? (
          <Text style={{ paddingBlock: 16 }} type={'secondary'}>
            {t('overview.noActiveTasks')}
          </Text>
        ) : (
          activeTasks.map((task) => (
            <NavItem
              icon={task.status === 'paused' ? Clock3Icon : CircleDotIcon}
              key={task.id}
              title={task.name || task.instruction}
              description={
                (task.description || task.instruction) !== (task.name || task.instruction)
                  ? task.description || task.instruction
                  : undefined
              }
              extra={
                <Tag shape={'round'} size={'small'}>
                  {t(`goals.status.${task.status}`, { defaultValue: task.status })}
                </Tag>
              }
              onClick={() => navigate(taskDetailPath(task.id, undefined, task.name))}
            />
          ))
        )}
      </Flexbox>

      <Flexbox className={styles.section} gap={12}>
        <SectionTitle count={works.length} title={t('overview.latestWorks')} />
        {workSWR.error ? (
          <AsyncError
            error={workSWR.error}
            variant={'inline'}
            onRetry={() => void workSWR.mutate()}
          />
        ) : workSWR.isLoading ? (
          <ArticleSkeleton rows={4} />
        ) : works.length === 0 ? (
          <Empty
            description={t('overview.worksEmptyDescription')}
            icon={PackageOpenIcon}
            title={t('overview.worksEmptyTitle')}
          />
        ) : (
          <div className={styles.works}>
            {works.map((work: WorkSummaryItem) => (
              <WorkSummaryCard item={work} key={work.id} onOpen={openWork} />
            ))}
          </div>
        )}
      </Flexbox>

      <details
        className={styles.section}
        onToggle={(event) => setPolicyOpen(event.currentTarget.open)}
      >
        <summary style={{ cursor: 'pointer', fontSize: 13 }}>{t('orchestration.title')}</summary>
        {policyOpen && <OrchestrationPolicyCard detail={detail} projectId={projectId} />}
      </details>
    </Flexbox>
  );
});

ProjectDashboard.displayName = 'ProjectDashboard';

export default ProjectDashboard;
