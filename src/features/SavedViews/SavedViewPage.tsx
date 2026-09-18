'use client';

import { Empty, Flexbox } from '@lobehub/ui';
import { Alert, Text } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

const SavedViewPage = memo(() => {
  const { t } = useTranslation('common');
  const { viewId } = useParams<{ viewId: string }>();
  const workspaceId = useActiveWorkspaceId();
  const { data, isLoading } = useClientDataSWR(
    viewId ? workAttentionKeys.savedView(workspaceId, viewId) : null,
    () => workAttentionService.savedViewEvaluate({ id: viewId! }),
  );
  const view = data?.data.view;
  const evaluation = data?.data.evaluation;
  const tasks = evaluation?.tasks ?? [];

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {view?.name ?? t('tab.views')}
          </Text>
        }
      />
      <Flexbox gap={12} padding={16} style={{ overflow: 'auto' }}>
        {evaluation?.needsRepair ? (
          <Alert
            showIcon
            description={t('savedViews.needsRepairDesc')}
            title={t('savedViews.needsRepair')}
            type="warning"
          />
        ) : null}
        {isLoading ? (
          <Text type="secondary">{t('savedViews.loading')}</Text>
        ) : evaluation?.needsRepair ? (
          <Empty description={t('savedViews.needsRepairEmpty')} />
        ) : tasks.length === 0 ? (
          <Empty description={t('savedViews.emptyResults')} />
        ) : (
          tasks.map((task) => (
            <WorkspaceLink
              key={task.id}
              to={taskDetailPath(task.id, task.assigneeAgentId ?? undefined, task.name)}
            >
              <Text weight={500}>{task.name ?? task.instruction}</Text>
            </WorkspaceLink>
          ))
        )}
      </Flexbox>
    </Flexbox>
  );
});

SavedViewPage.displayName = 'SavedViewPage';

export default SavedViewPage;
