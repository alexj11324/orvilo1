'use client';

import { Empty, Flexbox } from '@lobehub/ui';
import {
  Button,
  TabsIndicator,
  TabsList,
  TabsRoot,
  TabsTab,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import type { MyWorkMode } from '@orvilo/types';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router';

import { useActiveWorkspaceId } from '@/business/client/hooks/useActiveWorkspaceId';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import NavHeader from '@/features/NavHeader';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { mutate, useClientDataSWR } from '@/libs/swr';
import { workAttentionKeys } from '@/libs/swr/keys';
import { workAttentionService } from '@/services/workAttention';

import { isMyWorkSaveableMode, myWorkSaveAsQuery } from './myWorkSaveAs';

const PRIMARY_TABS: MyWorkMode[] = ['assigned', 'delegated', 'review'];
const SECONDARY_TABS: MyWorkMode[] = ['created', 'subscribed'];

const resolveMode = (value: string | null): MyWorkMode => {
  if (value && [...PRIMARY_TABS, ...SECONDARY_TABS].includes(value as MyWorkMode)) {
    return value as MyWorkMode;
  }
  return 'assigned';
};

const MyWorkPage = memo(() => {
  const { t } = useTranslation('common');
  const workspaceId = useActiveWorkspaceId();
  const navigate = useWorkspaceAwareNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const mode = resolveMode(searchParams.get('tab'));

  const { data, isLoading } = useClientDataSWR(workAttentionKeys.myWork(workspaceId, mode), () =>
    workAttentionService.myWork({ mode }),
  );
  const tasks = data?.data.tasks ?? [];
  const canSaveAs = isMyWorkSaveableMode(mode);

  const tabs = useMemo(
    () =>
      [...PRIMARY_TABS, ...SECONDARY_TABS].map((item) => ({
        key: item,
        label: t(`myWork.${item}`),
      })),
    [t],
  );

  const saveCopy = useCallback(async () => {
    if (!isMyWorkSaveableMode(mode)) return;
    try {
      const created = await workAttentionService.savedViewCreate({
        entityType: 'task',
        name: t(`myWork.${mode}`),
        query: myWorkSaveAsQuery(mode),
        visibility: 'private',
      });
      await mutate(workAttentionKeys.savedViews(workspaceId));
      navigate(`/views/${created.data.id}`);
    } catch {
      toast.error(t('myWork.saveAsFailed'));
    }
  }, [mode, navigate, t, workspaceId]);

  return (
    <Flexbox flex={1} height="100%">
      <NavHeader
        left={
          <Text style={{ paddingInlineStart: 4 }} weight={500}>
            {t('tab.myWork')}
          </Text>
        }
        right={
          canSaveAs ? (
            <Button size="small" onClick={() => void saveCopy()}>
              {t('myWork.saveAs')}
            </Button>
          ) : null
        }
      />
      <Flexbox gap={16} padding={16} style={{ overflow: 'auto' }}>
        <TabsRoot
          value={mode}
          onValueChange={(value) => setSearchParams({ tab: value }, { replace: true })}
        >
          <TabsList>
            <TabsIndicator />
            {tabs.map((item) => (
              <TabsTab key={item.key} value={item.key}>
                {item.label}
              </TabsTab>
            ))}
          </TabsList>
        </TabsRoot>
        {isLoading ? (
          <Text type="secondary">{t('myWork.loading')}</Text>
        ) : tasks.length === 0 ? (
          <Empty description={t('myWork.empty')} />
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

MyWorkPage.displayName = 'MyWorkPage';

export default MyWorkPage;
