import { Flexbox } from '@lobehub/ui';
import { Button } from '@lobehub/ui/base-ui';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

import NotFound from '@/components/404';
import AsyncError from '@/components/AsyncError';
import AutoSaveHint from '@/components/Editor/AutoSaveHint';
import WorkFavoriteButton from '@/features/HomeSidebar/Body/WorkFavoriteButton';
import NavHeader from '@/features/NavHeader';
import ToggleRightPanelButton from '@/features/RightPanel/ToggleRightPanelButton';
import { WorkSurface, WorkSurfaceDocument } from '@/features/WorkSurface';
import { useGlobalStore } from '@/store/global';
import { systemStatusSelectors } from '@/store/global/selectors';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import Breadcrumb from '../shared/Breadcrumb';
import IssueContent from './IssueContent';
import TaskDetailHeaderActions from './TaskDetailHeaderActions';
import TopicChatDrawer from './TopicChatDrawer';
import { useActiveTaskDetail } from './useActiveTaskDetail';

interface TaskDetailPageProps {
  showTaskAgentPanelToggle?: boolean;
  taskId: string;
}

const TaskDetailPage = memo<TaskDetailPageProps>(({ taskId, showTaskAgentPanelToggle = true }) => {
  const { t } = useTranslation('chat');
  const saveStatus = useTaskStore(taskDetailSelectors.taskSaveStatus);
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
      <Flexbox flex={1} height={'100%'} style={{ minHeight: 0, position: 'relative' }}>
        <NavHeader
          left={<Breadcrumb taskId={taskId} />}
          styles={{ left: { paddingLeft: 4, gap: 8 } }}
        />
        <Flexbox flex={1} style={{ minHeight: 0, overflowY: 'auto' }}>
          <AsyncError error={error} variant={'page'} onRetry={onRetry} />
        </Flexbox>
      </Flexbox>
    );
  }

  if (isNotFound) {
    return (
      <Flexbox flex={1} height={'100%'} style={{ minHeight: 0, position: 'relative' }}>
        <NavHeader
          left={<Breadcrumb taskId={taskId} />}
          styles={{ left: { paddingLeft: 4, gap: 8 } }}
        />
        <Flexbox flex={1} style={{ minHeight: 0, overflowY: 'auto' }}>
          <NotFound
            desc={t('taskDetail.notFound.desc')}
            title={t('taskDetail.notFound.title')}
            extra={
              <Link to={'/tasks'}>
                <Button type={'primary'}>{t('taskDetail.notFound.backToTasks')}</Button>
              </Link>
            }
          />
        </Flexbox>
      </Flexbox>
    );
  }

  return (
    <WorkSurface style={{ position: 'relative' }}>
      <NavHeader
        left={
          <>
            <Breadcrumb taskId={taskId} />
            {/* Reference: the star and overflow sit inline right after the
                issue crumb; the copy buttons moved into the rail's round
                action row (TaskRailActions), so the header's right side only
                keeps the agent-panel toggle. */}
            <WorkFavoriteButton icon={'star'} targetId={taskId} targetType="task" variant="icon" />
            <TaskDetailHeaderActions />
            {saveStatus === 'saving' || saveStatus === 'failed' ? (
              <AutoSaveHint saveStatus={saveStatus} />
            ) : undefined}
          </>
        }
        right={
          <>
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
      {/* Detail is prose — instruction, deliverables, activity — so it mounts
          the document frame: a centered reading column at a fixed max width,
          invariant under the chat wide-screen toggle. `IssueContent` is the
          same body the inbox split pane mounts. */}
      <WorkSurfaceDocument>
        <IssueContent detail={detail} taskId={taskId} />
      </WorkSurfaceDocument>
      <TopicChatDrawer />
    </WorkSurface>
  );
});

export default TaskDetailPage;
