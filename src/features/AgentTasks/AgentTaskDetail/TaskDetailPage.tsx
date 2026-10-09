import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import NotFound from '@/components/404';
import AsyncError from '@/components/AsyncError';
import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import { Button } from '@/components/ui/button';
import NavHeader from '@/features/NavHeader';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import { WorkSurface, WorkSurfaceDocument } from '@/features/WorkSurface';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import Breadcrumb from '../shared/Breadcrumb';
import IssueContent from './IssueContent';
import { taskDetailFullPageStyles } from './taskDetailFullPageStyles';
import TaskDetailHeaderActions from './TaskDetailHeaderActions';
import TaskDetailRunPauseAction from './TaskDetailRunPauseAction';
import { TaskDetailScope } from './TaskDetailScope';
import TopicChatDrawer from './TopicChatDrawer';
import { useActiveTaskDetail } from './useActiveTaskDetail';

interface TaskDetailPageProps {
  showTaskAgentPanelToggle?: boolean;
  taskId: string;
}

const TaskDetailPage = memo<TaskDetailPageProps>(({ taskId, showTaskAgentPanelToggle = true }) => {
  const { t } = useTranslation('chat');
  const saveStatus = useTaskStore((s) => taskDetailSelectors.taskSaveStatusFor(s, taskId));
  const [showTaskAgentPanel, toggleTaskAgentPanel] = useGlobalStore((s) => [
    systemStatusSelectors.showTaskAgentPanel(s),
    s.toggleTaskAgentPanel,
  ]);

  const detail = useActiveTaskDetail(taskId);
  const { isNotFound, error, onRetry } = detail;

  // A transient fetch failure (network / 500) is not a 404 — keep the URL and
  // offer Reload instead of the terminal "task was deleted" dead-end below.
  if (error) {
    return (
      <div className="flex flex-col flex-1 h-full" style={{ minHeight: 0, position: 'relative' }}>
        <NavHeader
          left={<Breadcrumb taskId={taskId} />}
          styles={{ left: { paddingLeft: 4, gap: 8 } }}
        />
        <div className="flex flex-col flex-1" style={{ minHeight: 0, overflowY: 'auto' }}>
          <AsyncError error={error} variant={'page'} onRetry={onRetry} />
        </div>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="flex flex-col flex-1 h-full" style={{ minHeight: 0, position: 'relative' }}>
        <NavHeader
          left={<Breadcrumb taskId={taskId} />}
          styles={{ left: { paddingLeft: 4, gap: 8 } }}
        />
        <div className="flex flex-col flex-1" style={{ minHeight: 0, overflowY: 'auto' }}>
          <NotFound
            desc={t('taskDetail.notFound.desc')}
            title={t('taskDetail.notFound.title')}
            extra={
              <Link to={'/tasks'}>
                <Button variant="default">{t('taskDetail.notFound.backToTasks')}</Button>
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <TaskDetailScope taskId={taskId}>
      <WorkSurface style={{ position: 'relative' }}>
        <NavHeader
          left={
            <>
              <Breadcrumb taskId={taskId} />
              {/* Reference: the star and overflow sit inline right after the
                issue crumb — both rendered by TaskDetailHeaderActions so they
                share one favourite identity. The copy buttons live in the
                rail's round action row (TaskRailActions), so the header's
                right side keeps task execution and the agent-panel toggle. */}
              <TaskDetailHeaderActions />
              {saveStatus === 'saving' || saveStatus === 'failed' ? (
                <AutoSaveHint saveStatus={saveStatus} />
              ) : undefined}
            </>
          }
          right={
            <>
              <TaskDetailRunPauseAction />
              {showTaskAgentPanelToggle ? (
                <ToggleRightPanelButton
                  hideWhenExpanded
                  expand={showTaskAgentPanel}
                  onToggle={() => toggleTaskAgentPanel()}
                />
              ) : undefined}
            </>
          }
          styles={{
            left: {
              paddingLeft: 4,
              gap: 8,
            },
          }}
        />
        {/* The routed issue uses the page geometry; the split pane and Portal
          still mount IssueContent with their own container widths. */}
        <WorkSurfaceDocument className={taskDetailFullPageStyles.document}>
          <IssueContent detail={detail} taskId={taskId} />
        </WorkSurfaceDocument>
        <TopicChatDrawer />
      </WorkSurface>
    </TaskDetailScope>
  );
});

export default TaskDetailPage;
