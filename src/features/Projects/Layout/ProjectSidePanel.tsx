'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { Button, SkeletonText, Tag, Text } from '@lobehub/ui/base-ui';
import type { TaskStatus } from '@orvilo/types';
import { createStaticStyles, cssVar } from 'antd-style';
import { BadgeCheckIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { useWorkspaceCapabilities } from '@/business/client/hooks/useWorkspaceCapabilities';
import AsyncError from '@/components/AsyncError';
import ProjectPropertiesCard from '@/features/Projects/Workspace/ProjectPropertiesCard';
import { useProjectMembersQuery } from '@/features/Teammates/api/hooks';
import { canInviteToProject } from '@/features/Teammates/api/roleCapabilities';
import { openInviteTeammateModal } from '@/features/Teammates/InviteTeammateModal';
import { useTeammatesEnabled } from '@/features/Teammates/useTeammatesEnabled';
import { goalSelectors, useGoalStore } from '@/store/goal';
import { useCurrentProjectDetail, useProjectStore } from '@/store/project';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

const styles = createStaticStyles(({ css }) => ({
  attention: css`
    padding-block: 10px;
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};

    &:last-child {
      border-block-end: 0;
    }
  `,
  panel: css`
    overflow-y: auto;
    flex: none;

    width: 300px;
    height: 100%;
    padding: 12px;
    border-inline-start: 1px solid ${cssVar.colorBorderSecondary};
  `,
  railCard: css`
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 10px;
    background: color-mix(in srgb, ${cssVar.colorBgContainer} 78%, transparent);
  `,
}));

const ATTENTION_STATUSES = new Set<TaskStatus | string>(['failed', 'paused']);

const SectionTitle = memo<{ count?: number; title: string }>(({ count, title }) => (
  <Flexbox horizontal align={'center'} gap={7}>
    <Text fontSize={14} weight={500}>
      {title}
    </Text>
    {count !== undefined && <Tag shape={'round'}>{count}</Tag>}
  </Flexbox>
));

// Linear keeps one persistent right-hand panel across every project tab
// (Overview | Activity | Issues), so it lives on the layout rather than any
// single page.
const ProjectSidePanel = memo<{ projectId: string }>(({ projectId }) => {
  const { t } = useTranslation('project');
  const detail = useCurrentProjectDetail(projectId);
  useProjectStore((s) => s.useFetchProjectDetail)(projectId);
  const workspaceId = useActiveWorkspaceId();
  const teammatesEnabled = useTeammatesEnabled();
  const capabilities = useWorkspaceCapabilities();
  const currentUserId = useUserStore(userProfileSelectors.userId);
  // The route param is often the slug, not the row id — members, goals and
  // invite APIs all key on `project.id`, so wait for the detail record.
  const databaseId = detail?.project.id;
  const membersEnabled = teammatesEnabled && !!workspaceId;
  const membersSWR = useProjectMembersQuery(databaseId, membersEnabled && !!databaseId);
  const goalScope = `project:${databaseId ?? projectId}`;
  const goals = useGoalStore(goalSelectors.goalList(goalScope));
  useGoalStore((s) => s.useFetchGoals)(undefined, databaseId);

  if (!detail || !databaseId) return null;

  const tasks = detail.tasks ?? [];
  const attentionTasks = tasks.filter((task) => ATTENTION_STATUSES.has(task.status)).slice(0, 3);
  const completedGoals = goals.filter(({ goal }) => goal.status === 'achieved').length;
  // No goals (or a failed fetch) is not 0% progress — report it as unknown
  // instead of letting an error render as a real zero.
  const progress = goals.length ? Math.round((completedGoals / goals.length) * 100) : null;

  return (
    <Flexbox className={styles.panel} gap={12}>
      <Flexbox className={styles.railCard} gap={12}>
        <SectionTitle title={t('overview.propertiesLabel')} />
        <ProjectPropertiesCard detail={detail} goalProgress={progress} projectId={databaseId} />
      </Flexbox>
      <Flexbox className={styles.railCard} gap={12}>
        <SectionTitle count={attentionTasks.length} title={t('overview.needsAttention')} />
        {attentionTasks.length === 0 ? (
          <Flexbox align={'center'} gap={8} paddingBlock={12}>
            <Icon color={cssVar.colorSuccess} icon={BadgeCheckIcon} size={22} />
            <Text fontSize={13} type={'secondary'}>
              {t('overview.nothingNeedsAttention')}
            </Text>
          </Flexbox>
        ) : (
          attentionTasks.map((task) => (
            <Flexbox className={styles.attention} gap={4} key={task.id}>
              <Text weight={500}>{task.name || task.instruction}</Text>
              <Text fontSize={12} type={task.status === 'failed' ? 'danger' : 'secondary'}>
                {task.status === 'failed' ? t('overview.taskFailed') : t('overview.taskWaiting')}
              </Text>
            </Flexbox>
          ))
        )}
      </Flexbox>

      <Flexbox className={styles.railCard} gap={12}>
        <SectionTitle title={t('overview.projectSummary')} />
        <Flexbox horizontal justify={'space-between'}>
          <Text type={'secondary'}>{t('sections.goals')}</Text>
          <Text>{goals.length}</Text>
        </Flexbox>
        <Flexbox horizontal justify={'space-between'}>
          <Text type={'secondary'}>{t('sections.tasks')}</Text>
          <Text>{tasks.length}</Text>
        </Flexbox>
        <Flexbox horizontal justify={'space-between'}>
          <Text type={'secondary'}>{t('sections.agents')}</Text>
          <Text>{detail.agents?.length ?? 0}</Text>
        </Flexbox>
        <Flexbox horizontal justify={'space-between'}>
          <Text type={'secondary'}>{t('sections.knowledgeBases')}</Text>
          <Text>{detail.knowledgeBases?.length ?? 0}</Text>
        </Flexbox>
      </Flexbox>

      {membersEnabled && (
        <Flexbox className={styles.railCard} gap={12}>
          <SectionTitle
            count={membersSWR.data?.length}
            title={t('sections.teammates', { defaultValue: 'Teammates' })}
          />
          {membersSWR.error ? (
            <AsyncError
              error={membersSWR.error}
              variant={'inline'}
              onRetry={() => void membersSWR.mutate()}
            />
          ) : membersSWR.isLoading ? (
            <SkeletonText style={{ marginBottom: 0, width: '60%' }} />
          ) : (
            <Flexbox horizontal align={'center'} justify={'space-between'}>
              <Text fontSize={13} type={'secondary'}>
                {t('sections.teammatesHint', {
                  defaultValue: 'People collaborating in this project',
                })}
              </Text>
              {canInviteToProject(capabilities.canInvite, detail.project, currentUserId) && (
                <Button
                  size={'small'}
                  type={'text'}
                  onClick={() => openInviteTeammateModal({ defaultProjectIds: [databaseId] })}
                >
                  {t('sections.invite', { defaultValue: 'Invite' })}
                </Button>
              )}
            </Flexbox>
          )}
        </Flexbox>
      )}
    </Flexbox>
  );
});

ProjectSidePanel.displayName = 'ProjectSidePanel';

export default ProjectSidePanel;
