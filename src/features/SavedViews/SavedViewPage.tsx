'use client';

import { Empty, Flexbox, Input } from '@lobehub/ui';
import { Alert, Button, Select, Text, TextArea, toast } from '@lobehub/ui/base-ui';
import type { SavedViewVisibility } from '@orvilo/types';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { lambdaClient } from '@/libs/trpc/client';
import { workAttentionService } from '@/services/workAttention';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';
import { isTrpcErrorCode } from '@/utils/trpcError';

import { stringifyWorkQueryDraft, workQueryFromDraft } from './savedViewQueryDraft';
import { isSavedViewShareReady, savedViewCopyName, savedViewSharePatch } from './savedViewShare';

const SavedViewPage = memo(() => {
  const { t } = useTranslation('common');
  const { viewId } = useParams<{ viewId: string }>();
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const currentUserId = useUserStore(userProfileSelectors.userId);
  const { data, isLoading } = useClientDataSWR(
    viewId ? workAttentionKeys.savedView(workspaceId, viewId) : null,
    () => workAttentionService.savedViewEvaluate({ id: viewId! }),
  );
  const { data: favoritesData } = useClientDataSWR(workAttentionKeys.favorites(workspaceId), () =>
    workAttentionService.favoriteList(),
  );
  const { data: teamsData } = useClientDataSWR(
    workspaceId ? workAttentionKeys.teams(workspaceId) : null,
    () => lambdaClient.team.teams.query(),
  );
  const view = data?.data.view;
  const evaluation = data?.data.evaluation;
  const tasks = evaluation?.tasks ?? [];
  const isOwner = Boolean(currentUserId && view && view.ownerUserId === currentUserId);
  const [name, setName] = useState('');
  const [queryDraft, setQueryDraft] = useState('');
  const [visibility, setVisibility] = useState<SavedViewVisibility>('private');
  const [teamId, setTeamId] = useState<string | null>(null);
  const viewName = view?.name;
  const viewQueryAst = view?.queryAst;
  const viewVisibility = view?.visibility;
  const viewTeamId = view?.teamId;
  const viewIdValue = view?.id;
  const definitionVersion = view?.definitionVersion;

  useEffect(() => {
    if (!viewIdValue) return;
    setName(viewName ?? '');
    setQueryDraft(viewQueryAst ? stringifyWorkQueryDraft(viewQueryAst) : '');
    setVisibility(viewVisibility ?? 'private');
    setTeamId(viewTeamId ?? null);
  }, [definitionVersion, viewIdValue, viewName, viewQueryAst, viewTeamId, viewVisibility]);

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
  const teamOptions = useMemo(
    () => (teamsData?.data ?? []).map((team) => ({ label: team.name, value: team.id })),
    [teamsData?.data],
  );
  const visibilityOptions = useMemo(
    () => [
      { label: t('savedViews.visibilityPrivate'), value: 'private' },
      ...(workspaceId
        ? [
            { label: t('savedViews.visibilityWorkspace'), value: 'workspace' },
            { label: t('savedViews.visibilityTeam'), value: 'team' },
          ]
        : []),
    ],
    [t, workspaceId],
  );
  const shareReady = isSavedViewShareReady(visibility, teamId);

  const refreshView = useCallback(async () => {
    if (!viewId) return;
    await mutate(workAttentionKeys.savedView(workspaceId, viewId));
    await mutate(workAttentionKeys.savedViews(workspaceId));
    await mutate(workAttentionKeys.favorites(workspaceId));
  }, [viewId, workspaceId]);

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

  const saveView = useCallback(async () => {
    if (!viewId || !view || !shareReady) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const query = workQueryFromDraft(queryDraft, view.entityType);
    if (!query) {
      toast.error(t('savedViews.queryInvalid'));
      return;
    }
    try {
      await workAttentionService.savedViewUpdate({
        expectedDefinitionVersion: view.definitionVersion,
        id: viewId,
        name: trimmed,
        query,
        ...savedViewSharePatch(visibility, teamId),
      });
      await refreshView();
      toast.success(t('savedViews.saved'));
    } catch (error) {
      toast.error(
        isTrpcErrorCode(error, 'CONFLICT')
          ? t('savedViews.versionConflict')
          : t('savedViews.saveFailed'),
      );
      await refreshView();
    }
  }, [name, queryDraft, refreshView, shareReady, t, teamId, view, viewId, visibility]);

  const saveCopy = useCallback(async () => {
    if (!view) return;
    const query = workQueryFromDraft(queryDraft, view.entityType) ?? view.queryAst;
    if (!query) {
      toast.error(t('savedViews.queryInvalid'));
      return;
    }
    try {
      const created = await workAttentionService.savedViewCreate({
        entityType: view.entityType,
        layout: view.layout,
        name: savedViewCopyName(name || view.name, t('copy')),
        query,
        visibility: 'private',
      });
      await mutate(workAttentionKeys.savedViews(workspaceId));
      navigate(`/views/${created.data.id}`);
    } catch {
      toast.error(t('savedViews.saveAsFailed'));
    }
  }, [name, navigate, queryDraft, t, view, workspaceId]);

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
            {isOwner ? (
              <Button
                disabled={!shareReady}
                size="small"
                type="primary"
                onClick={() => void saveView()}
              >
                {t('save')}
              </Button>
            ) : null}
            <Button size="small" onClick={() => void saveCopy()}>
              {t('savedViews.saveAs')}
            </Button>
            <Button size="small" onClick={() => void toggleFavorite()}>
              {pinned ? t('savedViews.unfavorite') : t('savedViews.favorite')}
            </Button>
            {isOwner ? (
              <Button size="small" onClick={() => void deleteView()}>
                {t('savedViews.delete')}
              </Button>
            ) : null}
          </Flexbox>
        }
      />
      <Flexbox gap={12} padding={16} style={{ overflow: 'auto' }}>
        {isOwner ? (
          <Flexbox gap={8}>
            <Input
              placeholder={t('savedViews.name')}
              size="small"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <TextArea
              aria-label={t('savedViews.query')}
              autoSize={{ minRows: 6, maxRows: 16 }}
              placeholder={t('savedViews.query')}
              value={queryDraft}
              onChange={(event) => setQueryDraft(event.target.value)}
            />
            <Flexbox horizontal gap={8} wrap="wrap">
              <Select
                options={visibilityOptions}
                size="small"
                style={{ minWidth: 160 }}
                value={visibility}
                onChange={(next) => {
                  if (next === 'private' || next === 'team' || next === 'workspace') {
                    setVisibility(next);
                    if (next !== 'team') setTeamId(null);
                  }
                }}
              />
              {visibility === 'team' ? (
                <Select
                  options={teamOptions}
                  placeholder={t('savedViews.teamRequired')}
                  size="small"
                  style={{ minWidth: 160 }}
                  value={teamId ?? undefined}
                  onChange={(next) => {
                    if (typeof next === 'string') setTeamId(next);
                  }}
                />
              ) : null}
            </Flexbox>
          </Flexbox>
        ) : null}
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
