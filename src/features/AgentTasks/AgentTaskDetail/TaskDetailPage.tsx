import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import NotFound from '@/components/404';
import AsyncError from '@/components/AsyncError';
import { buttonVariants } from '@/components/ui/button';
import NavHeader from '@/features/NavHeader';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import { WorkSurface, WorkSurfaceDocument } from '@/features/WorkSurface';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';

import Breadcrumb from '../shared/Breadcrumb';
import IssueContent from './IssueContent';
import IssueHeaderRunControl from './IssueHeaderRunControl';
import IssueSaveStatus from './IssueSaveStatus';
import { taskDetailFullPageStyles } from './taskDetailFullPageStyles';
import TaskDetailHeaderActions from './TaskDetailHeaderActions';
import { TaskDetailScope } from './TaskDetailScope';
import TopicChatDrawer from './TopicChatDrawer';
import { useActiveTaskDetail } from './useActiveTaskDetail';

interface TaskDetailPageProps {
  showTaskAgentPanelToggle?: boolean;
  taskId: string;
}

const TaskDetailPage = memo<TaskDetailPageProps>(({ taskId, showTaskAgentPanelToggle = true }) => {
  const { t } = useTranslation('chat');
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
      <div className="relative flex h-full min-h-0 flex-1 flex-col">
        <NavHeader
          left={<Breadcrumb taskId={taskId} />}
          styles={{ left: { paddingLeft: 4, gap: 8 } }}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <AsyncError error={error} variant={'page'} onRetry={onRetry} />
        </div>
      </div>
    );
  }

  if (isNotFound) {
    return (
      <div className="relative flex h-full min-h-0 flex-1 flex-col">
        <NavHeader
          left={<Breadcrumb taskId={taskId} />}
          styles={{ left: { paddingLeft: 4, gap: 8 } }}
        />
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <NotFound
            desc={t('taskDetail.notFound.desc')}
            title={t('taskDetail.notFound.title')}
            extra={
              <Link className={buttonVariants({ variant: 'default' })} to={'/tasks'}>
                {t('taskDetail.notFound.backToTasks')}
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <TaskDetailScope taskId={taskId}>
      <WorkSurface className="relative">
        <NavHeader
          left={
            <>
              <Breadcrumb taskId={taskId} />
              <IssueSaveStatus key={taskId} taskId={taskId} />
            </>
          }
          right={
            <>
              <IssueHeaderRunControl />
              {/* Reference: the copy icons, favourite star and overflow menu
                anchor the right end of the top bar — the breadcrumb hugs the
                left. TaskDetailHeaderActions renders them as one cluster so
                they share a favourite identity; the transient run control
                joins on its left and the agent-panel toggle keeps the edge.
                Subscribe lives in the Activity section header. */}
              <TaskDetailHeaderActions />
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
