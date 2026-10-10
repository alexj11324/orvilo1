import { agentDisplayName } from '@orvilo/types';
import { cn } from 'cn';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { ChevronRightIcon, MoreHorizontalIcon, Trash2Icon } from 'lucide-react';
import { memo, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router';

import NotFound from '@/components/404';
import ActionIcon from '@/components/ActionIcon';
import AsyncError from '@/components/AsyncError';
import { DropdownMenu } from '@/components/ItemsMenu';
import { confirmModal } from '@/components/Modal';
import { SelectOptionItems } from '@/components/SelectOptions';
import { toast } from '@/components/toast';
import { Button, buttonVariants } from '@/components/ui/button';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import NavHeader from '@/features/NavHeader';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';
import WorkspaceLink from '@/features/Workspace/WorkspaceLink';
import { WorkSurface, WorkSurfaceDocument } from '@/features/WorkSurface';
import { usePermission } from '@/hooks/usePermission';
import { useCurrentProjectList, useProjectStore } from '@/store/project';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import TaskDetailRunPauseAction from '../AgentTasks/AgentTaskDetail/TaskDetailRunPauseAction';
import {
  TaskDetailScope,
  useTaskDetailSelector,
  useTaskDetailTaskId,
} from '../AgentTasks/AgentTaskDetail/TaskDetailScope';
import TaskDetailSkeleton from '../AgentTasks/AgentTaskDetail/TaskDetailSkeleton';
import TaskDetailTitleInput from '../AgentTasks/AgentTaskDetail/TaskDetailTitleInput';
import TopicChatDrawer from '../AgentTasks/AgentTaskDetail/TopicChatDrawer';
import { useActiveTaskDetail } from '../AgentTasks/AgentTaskDetail/useActiveTaskDetail';
import AssigneeAgentSelector from '../AgentTasks/features/AssigneeAgentSelector';
import AssigneeAvatar from '../AgentTasks/features/AssigneeAvatar';
import { useAgentDisplayMeta } from '../AgentTasks/shared/useAgentDisplayMeta';
import { useUserDisplayMeta } from '../AgentTasks/shared/useUserDisplayMeta';
import AutomationBreadcrumb from './AutomationBreadcrumb';
import AutomationRunList from './AutomationRunList';
import AutomationSettingsTab from './AutomationSettingsTab';
import AutomationStatusBadge from './AutomationStatusBadge';
import ResultDeliveryList from './ResultDeliveryList';
import { automationStatusOf } from './shared';
import { useAutomationActions } from './useAutomationActions';
import { useCanManageAutomation } from './useCanManageAutomation';

dayjs.extend(relativeTime);

const ProjectSelect = memo(() => {
  const { t } = useTranslation('automation');
  const { allowed: canEdit, reason } = usePermission('create_content');
  const taskId = useTaskDetailTaskId();
  const projectId = useTaskDetailSelector(
    (s, scopedTaskId) => taskDetailSelectors.taskDetail(s, scopedTaskId)?.projectId ?? null,
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
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Select
                disabled={!canEdit || !taskId}
                items={options}
                value={projectId ?? ''}
                onValueChange={(value) => {
                  if (!taskId || typeof value !== 'string') return;
                  void updateTask(taskId, { projectId: value || null });
                }}
              >
                <SelectTrigger size="sm" style={{ maxWidth: 200 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectOptionItems options={options} />
                </SelectContent>
              </Select>
            </span>
          }
        />
        <TooltipContent>{canEdit ? undefined : reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

const AutomationStatusSwitch = memo(() => {
  const { allowed: canEdit, reason } = usePermission('create_content');
  const status = useTaskDetailSelector(taskDetailSelectors.taskStatus);
  const mode = useTaskDetailSelector(
    (s, id) => taskDetailSelectors.taskDetail(s, id)?.automationMode,
  );
  const taskId = useTaskDetailTaskId();
  const updateTaskStatus = useTaskStore((s) => s.updateTaskStatus);
  const active = status ? automationStatusOf(status) === 'active' : true;

  if (mode === 'event') return null;
  return (
    <div className="flex items-center gap-2" title={canEdit ? undefined : reason}>
      <Switch
        checked={active}
        disabled={!canEdit || !taskId || status === 'running'}
        onCheckedChange={(checked) => {
          if (!taskId) return;
          void updateTaskStatus(taskId, checked ? 'scheduled' : 'paused');
        }}
      />
      {status ? <AutomationStatusBadge status={automationStatusOf(status)} /> : null}
    </div>
  );
});

const AgentChip = memo(() => {
  const { t } = useTranslation('automation');
  const agentId = useTaskDetailSelector(taskDetailSelectors.taskAgentId);
  const taskIdentifier = useTaskDetailTaskId();
  const visibility = useTaskDetailSelector(taskDetailSelectors.taskVisibility);
  const meta = useAgentDisplayMeta(agentId ?? undefined);

  return (
    <AssigneeAgentSelector
      currentAgentId={agentId}
      taskIdentifier={taskIdentifier ?? undefined}
      taskVisibility={visibility}
    >
      <div
        className="flex items-center gap-2"
        style={{
          border: `1px solid var(--sidebar-border)`,
          borderRadius: 8,
          cursor: 'pointer',
          paddingBlock: 6,
          paddingInline: 10,
          width: 'fit-content',
        }}
      >
        <AssigneeAvatar agentId={agentId ?? undefined} size={20} />
        <div className="text-[13px]">
          {agentId && meta ? agentDisplayName(meta) : t('instructions.unassigned')}
        </div>
        <ChevronRightIcon color={'var(--ant-color-text-tertiary)'} size={14} />
      </div>
    </AssigneeAgentSelector>
  );
});

const CreatedByLabel = memo(() => {
  const { t } = useTranslation('automation');
  const createdByUserId = useTaskDetailSelector(
    (s, scopedTaskId) => taskDetailSelectors.taskCreatedByUserId(s, scopedTaskId) ?? null,
  );
  const meta = useUserDisplayMeta(createdByUserId);
  if (!createdByUserId) return null;
  return (
    <div className="text-[12px] text-muted-foreground">
      {t('detail.created_by', { name: meta?.title ?? '' })}
    </div>
  );
});

const DetailHeaderActions = memo(() => {
  const { t } = useTranslation('automation');
  const { allowed: canEdit } = usePermission('create_content');
  const navigate = useWorkspaceAwareNavigate();
  const { remove } = useAutomationActions();
  const taskId = useTaskDetailTaskId();
  const automationMode = useTaskDetailSelector(taskDetailSelectors.taskAutomationMode);

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
  }, [taskId, navigate, remove, t]);

  return (
    <div className="flex items-center gap-1.5">
      {automationMode === 'event' ? (
        <Button
          variant="outline"
          onClick={() => taskId && navigate(`/automations/${taskId}?tab=settings`)}
        >
          {t('events.title')}
        </Button>
      ) : (
        <TaskDetailRunPauseAction />
      )}
      <DropdownMenu
        items={[
          {
            danger: true,
            icon: <Trash2Icon />,
            key: 'delete',
            label: t('actions.delete'),
            onClick: confirmDelete,
          },
        ]}
      >
        <ActionIcon
          disabled={!canEdit}
          icon={MoreHorizontalIcon}
          size="small"
          title={t('detail.more_actions')}
        />
      </DropdownMenu>
    </div>
  );
});

type DetailTab = 'runs' | 'settings';

const AutomationResults = memo(() => {
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const taskId = useTaskDetailTaskId();
  const canManage = useCanManageAutomation(detail?.createdByUserId);
  return taskId ? <ResultDeliveryList readOnly={!canManage} taskId={taskId} /> : null;
});

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
      <WorkSurface>
        <NavHeader
          left={<AutomationBreadcrumb taskId={taskId} />}
          styles={{ left: { paddingLeft: 4 } }}
        />
        <div className="flex flex-col flex-1" style={{ minHeight: 0, overflowY: 'auto' }}>
          <AsyncError error={error} variant={'page'} onRetry={onRetry} />
        </div>
      </WorkSurface>
    );
  }

  if (isNotFound) {
    return (
      <WorkSurface>
        <NavHeader
          left={<AutomationBreadcrumb taskId={taskId} />}
          styles={{ left: { paddingLeft: 4 } }}
        />
        <div className="flex flex-col flex-1" style={{ minHeight: 0, overflowY: 'auto' }}>
          <NotFound
            desc={t('detail.not_found')}
            title={t('detail.not_found')}
            extra={
              <WorkspaceLink
                className={cn(buttonVariants({ variant: 'outline' }))}
                to={'/automations'}
              >
                {t('page.back_to_automations')}
              </WorkspaceLink>
            }
          />
        </div>
      </WorkSurface>
    );
  }

  return (
    <TaskDetailScope taskId={taskId}>
      <WorkSurface>
        <NavHeader
          left={<AutomationBreadcrumb taskId={taskId} />}
          right={<DetailHeaderActions />}
          styles={{ left: { paddingLeft: 4 } }}
        />
        <WorkSurfaceDocument>
          {isInitialLoading ? (
            <TaskDetailSkeleton chrome={'body'} />
          ) : (
            <div className="flex flex-col gap-2">
              <TaskDetailTitleInput />
              <div className="flex items-center gap-4" style={{ flexWrap: 'wrap' }}>
                <AutomationStatusSwitch />
                <AgentChip />
                <ProjectSelect />
                <CreatedByLabel />
              </div>
              <Tabs value={tab} onValueChange={setTab}>
                <TabsList>
                  <TabsTrigger value="settings">{t('settings.tab_settings')}</TabsTrigger>
                  <TabsTrigger value="runs">{t('settings.tab_runs')}</TabsTrigger>
                </TabsList>
              </Tabs>
              {tab === 'settings' ? (
                <AutomationSettingsTab />
              ) : (
                <>
                  <AutomationRunList />
                  <AutomationResults />
                </>
              )}
            </div>
          )}
        </WorkSurfaceDocument>
        <TopicChatDrawer />
      </WorkSurface>
    </TaskDetailScope>
  );
});

export default AutomationDetailPage;
