'use client';

import { Empty, Flexbox } from '@lobehub/ui';
import { Alert, Button, Text, toast } from '@lobehub/ui/base-ui';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

const SavedViewPage = memo(() => {
  const { t } = useTranslation('common');
  const { viewId } = useParams<{ viewId: string }>();
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const { data, isLoading } = useClientDataSWR(
    viewId ? workAttentionKeys.savedView(workspaceId, viewId) : null,
    () => workAttentionService.savedViewEvaluate({ id: viewId! }),
  );
  const { data: favoritesData } = useClientDataSWR(workAttentionKeys.favorites(workspaceId), () =>
    workAttentionService.favoriteList(),
  );
  const view = data?.data.view;
  const evaluation = data?.data.evaluation;
  const tasks = evaluation?.tasks ?? [];
  const pinned = useMemo(
    () =>
      Boolean(
        viewId &&
        favoritesData?.data?.some(
          (item) => item.targetType === 'savedView' && item.targetId === viewId,
        ),
      ),
    [favoritesData?.data, viewId],
  );

  const toggleFavorite = useCallback(async () => {
    if (!viewId) return;
    try {
      if (pinned) {
        await workAttentionService.favoriteUnpin({ targetId: viewId, targetType: 'savedView' });
      } else {
        await workAttentionService.favoritePin({ targetId: viewId, targetType: 'savedView' });
      }
      await mutate(workAttentionKeys.favorites(workspaceId));
    } catch {
      toast.error(t('savedViews.favoriteFailed'));
    }
  }, [pinned, t, viewId, workspaceId]);

  const deleteView = useCallback(async () => {
    if (!viewId) return;
    try {
      await workAttentionService.savedViewDelete(viewId);
      await mutate(workAttentionKeys.savedViews(workspaceId));
      await mutate(workAttentionKeys.favorites(workspaceId));
      navigate('/views');
    } catch {
      toast.error(t('savedViews.deleteFailed'));
    }
  }, [navigate, t, viewId, workspaceId]);

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {view?.name ?? t('tab.views')}
          </Text>
        }
        right={
          <Flexbox horizontal gap={8}>
            <Button size="small" onClick={() => void toggleFavorite()}>
              {pinned ? t('savedViews.unfavorite') : t('savedViews.favorite')}
            </Button>
            <Button size="small" onClick={() => void deleteView()}>
              {t('savedViews.delete')}
            </Button>
          </Flexbox>
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
