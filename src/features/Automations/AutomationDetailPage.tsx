import { Flexbox, Icon, Tooltip } from '@lobehub/ui';
import {
  ActionIcon,
  Button,
  confirmModal,
  DropdownMenu,
  Select,
  Switch,
  Tabs,
  Text,
  toast,
} from '@lobehub/ui/base-ui';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { MoreHorizontalIcon, Trash2Icon } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';

import NotFound from '@/components/404';
import AsyncError from '@/components/AsyncError';
import NavHeader from '@/features/NavHeader';
import WideScreenContainer from '@/features/WideScreenContainer';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { usePermission } from '@/hooks/usePermission';
import { useCurrentProjectList, useProjectStore } from '@/store/project';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskDetailRunPauseAction from '../AgentTasks/AgentTaskDetail/TaskDetailRunPauseAction';
import TaskDetailSkeleton from '../AgentTasks/AgentTaskDetail/TaskDetailSkeleton';
import TaskDetailTitleInput from '../AgentTasks/AgentTaskDetail/TaskDetailTitleInput';
import TopicChatDrawer from '../AgentTasks/AgentTaskDetail/TopicChatDrawer';
import { useActiveTaskDetail } from '../AgentTasks/AgentTaskDetail/useActiveTaskDetail';
import { useUserDisplayMeta } from '../AgentTasks/shared/useUserDisplayMeta';
import AutomationBreadcrumb from './AutomationBreadcrumb';
import AutomationRunList from './AutomationRunList';
import AutomationSettingsTab from './AutomationSettingsTab';
import AutomationStatusBadge from './AutomationStatusBadge';
import { automationStatusOf } from './shared';
import { useAutomationActions } from './useAutomationActions';

dayjs.extend(relativeTime);

const ProjectSelect = memo(() => {
  const { t } = useTranslation('automation');
  const { allowed: canEdit, reason } = usePermission('create_content');
  const taskId = useTaskStore(taskDetailSelectors.activeTaskId);
  const projectId = useTaskStore(
    (s) => (s.activeTaskId ? s.taskDetailMap[s.activeTaskId]?.projectId : undefined) ?? null,
  );
  const updateTask = useTaskStore((s) => s.updateTask);
  const projects = useCurrentProjectList();
  useProjectStore((s) => s.useFetchProjectList)(true);

  const options = useMemo(
    () => [
      { label: t('detail.no_project'), value: '' },
      ...projects.map((project) => ({ label: project.name, value: project.id })),
    ],
    [projects, t],
  );

  return (
    <Tooltip title={canEdit ? undefined : reason}>
      <Select
        disabled={!canEdit || !taskId}
        options={options}
        size={'small'}
        style={{ maxWidth: 200 }}
        value={projectId ?? ''}
        onChange={(value) => {
          if (!taskId || typeof value !== 'string') return;
          void updateTask(taskId, { projectId: value || null });
        }}
      />
    </Tooltip>
  );
});

const AutomationStatusSwitch = memo(() => {
  const { allowed: canEdit, reason } = usePermission('create_content');
  const status = useTaskStore(taskDetailSelectors.activeTaskStatus);
  const taskId = useTaskStore(taskDetailSelectors.activeTaskId);
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus);
  const active = status ? automationStatusOf(status) === 'active' : true;

  return (
    <Flexbox horizontal align={'center'} gap={8}>
      <Switch
        checked={active}
        disabled={!canEdit || !taskId || status === 'running'}
        title={canEdit ? undefined : reason}
        onChange={(checked) => {
          if (!taskId) return;
          void updateTaskStatus(taskId, checked ? 'scheduled' : 'paused');
        }}
      />
      {status ? <AutomationStatusBadge status={automationStatusOf(status)} /> : null}
    </Flexbox>
  );
});

const CreatedByLabel = memo(() => {
  const { t } = useTranslation('automation');
  const createdByUserId = useTaskStore(
    (s) => (s.activeTaskId ? s.taskDetailMap[s.activeTaskId]?.createdByUserId : undefined) ?? null,
  );
  const meta = useUserDisplayMeta(createdByUserId);
  if (!createdByUserId) return null;
  return (
    <Text fontSize={12} type={'secondary'}>
      {t('detail.created_by', { name: meta?.title ?? '' })}
    </Text>
  );
});

const DetailHeaderActions = memo(() => {
  const { t } = useTranslation('automation');
  const { allowed: canEdit } = usePermission('create_content');
  const navigate = useWorkspaceAwareNavigate();
  const { remove } = useAutomationActions();
  const taskId = useTaskStore(taskDetailSelectors.activeTaskId);
  const name = useTaskStore(taskDetailSelectors.activeTaskName);

  const confirmDelete = useCallback(() => {
    if (!taskId) return;
    confirmModal({
      content: t('detail.delete_confirm.content'),
      okButtonProps: { danger: true },
      okText: t('actions.delete'),
      title: t('detail.delete_confirm.title'),
      onOk: async () => {
        try {
          await remove(taskId);
          toast.success(t('detail.deleted'));
          navigate('/automations');
        } catch {
          toast.error(t('detail.delete_failed'));
        }
      },
    });
  }, [taskId, name, navigate, remove, t]);

  return (
    <Flexbox horizontal align={'center'} gap={6}>
      <TaskDetailRunPauseAction />
      <DropdownMenu
        items={[
          {
            danger: true,
            icon: <Icon icon={Trash2Icon} />,
            key: 'delete',
            label: t('actions.delete'),
            onClick: confirmDelete,
          },
        ]}
      >
        <ActionIcon
          disabled={!canEdit}
          icon={MoreHorizontalIcon}
          size={'small'}
          title={t('detail.more_actions')}
        />
      </DropdownMenu>
    </Flexbox>
  );
});

type DetailTab = 'runs' | 'settings';

const AutomationDetailPage = memo(() => {
  const { t } = useTranslation('automation');
  const { taskId = '' } = useParams<{ taskId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: DetailTab = searchParams.get('tab') === 'runs' ? 'runs' : 'settings';

  const { isInitialLoading, isNotFound, error, onRetry } = useActiveTaskDetail(taskId);

  const setTab = useCallback(
    (key: string) => {
      const next = new URLSearchParams(searchParams);
      if (key === 'runs') next.set('tab', 'runs');
      else next.delete('tab');
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  if (error) {
    return (
      <Flexbox flex={1} height={'100%'}>
        <NavHeader
          left={<AutomationBreadcrumb taskId={taskId} />}
          styles={{ left: { paddingLeft: 4 } }}
        />
        <Flexbox flex={1} style={{ minHeight: 0, overflowY: 'auto' }}>
          <AsyncError error={error} variant={'page'} onRetry={onRetry} />
        </Flexbox>
      </Flexbox>
    );
  }

  if (isNotFound) {
    return (
      <Flexbox flex={1} height={'100%'}>
        <NavHeader
          left={<AutomationBreadcrumb taskId={taskId} />}
          styles={{ left: { paddingLeft: 4 } }}
        />
        <Flexbox flex={1} style={{ minHeight: 0, overflowY: 'auto' }}>
          <NotFound
            desc={t('detail.not_found')}
            title={t('detail.not_found')}
            extra={
              <WorkspaceLink to={'/automations'}>
                <Button type={'primary'}>{t('page.back_to_automations')}</Button>
              </WorkspaceLink>
            }
          />
        </Flexbox>
      </Flexbox>
    );
  }

  return (
    <Flexbox flex={1} height={'100%'}>
      <NavHeader
        left={<AutomationBreadcrumb taskId={taskId} />}
        right={<DetailHeaderActions />}
        styles={{ left: { paddingLeft: 4 } }}
      />
      <Flexbox flex={1} style={{ minHeight: 0, overflowY: 'auto' }}>
        <WideScreenContainer>
          {isInitialLoading ? (
            <TaskDetailSkeleton chrome={'body'} />
          ) : (
            <Flexbox gap={8} paddingBlock={16}>
              <TaskDetailTitleInput />
              <Flexbox horizontal align={'center'} gap={16} wrap={'wrap'}>
                <AutomationStatusSwitch />
                <ProjectSelect />
                <CreatedByLabel />
              </Flexbox>
              <Tabs
                activeKey={tab}
                items={[
                  { key: 'settings', label: t('settings.tab_settings') },
                  { key: 'runs', label: t('settings.tab_runs') },
                ]}
                onChange={setTab}
              />
              {tab === 'settings' ? <AutomationSettingsTab /> : <AutomationRunList />}
            </Flexbox>
          )}
        </WideScreenContainer>
      </Flexbox>
      <TopicChatDrawer />
    </Flexbox>
  );
});

export default AutomationDetailPage;
