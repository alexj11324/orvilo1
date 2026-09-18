'use client';

import { Empty, Flexbox } from '@lobehub/ui';
import { Button, Text } from '@lobehub/ui/base-ui';
import { memo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { myWorkSaveAsQuery } from '@/features/MyWork/myWorkSaveAs';
import NavHeader from '@/features/NavHeader';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

import { savedViewTitle } from './savedViewTitle';

const SavedViewsPage = memo(() => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const { data, isLoading } = useClientDataSWR(workAttentionKeys.savedViews(workspaceId), () =>
    workAttentionService.savedViewList(),
  );
  const views = data?.data ?? [];

  const createAssigned = useCallback(async () => {
    const created = await workAttentionService.savedViewCreate({
      entityType: 'task',
      name: t('savedViews.assignedDefaultName'),
      query: myWorkSaveAsQuery('assigned'),
      visibility: 'private',
    });
    await mutate(workAttentionKeys.savedViews(workspaceId));
    navigate(`/views/${created.data.id}`);
  }, [navigate, t, workspaceId]);

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('tab.views')}
          </Text>
        }
        right={
          <Button size="small" type="primary" onClick={() => void createAssigned()}>
            {t('savedViews.saveAssigned')}
          </Button>
        }
      />
      <Flexbox gap={8} padding={16} style={{ overflow: 'auto' }}>
        {isLoading ? (
          <Text type="secondary">{t('savedViews.loading')}</Text>
        ) : views.length === 0 ? (
          <Empty description={t('savedViews.empty')} />
        ) : (
          views.map((view) => (
            <WorkspaceLink key={view.id} to={`/views/${view.id}`}>
              <Text weight={500}>{savedViewTitle(view.id, view.name, t)}</Text>
            </WorkspaceLink>
          ))
        )}
      </Flexbox>
    </Flexbox>
  );
});

SavedViewsPage.displayName = 'SavedViewsPage';

export default SavedViewsPage;
