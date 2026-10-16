'use client';

import type { TaskDetailActivity } from '@orvilo/types';
import { MessageCircle, MessagesSquare } from 'lucide-react';
import { memo, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import Avatar from '@/components/Avatar';
import { Markdown } from '@/components/Markdown';
import { DEFAULT_AVATAR } from '@/const/meta';
import { useTaskStore } from '@/store/task';

import AssigneeAvatar from '../features/AssigneeAvatar';
import { isRunEndedBadly } from './runEnding';
import RunFailureReason from './RunFailureReason';
import RunReplyEditor from './RunReplyEditor';
import { useTaskDetailTaskId } from './TaskDetailScope';

/**
 * What the agent reported for this task, presented as a report.
 *
 * Deliberately NOT the activity card: no run chips, no attempt number, no
 * status glyph, no collapse chevron, no overflow menu, no outline. Every one of
 * those answers "which row of the list is this", and the reader of a result
 * panel already knows — the panel header names the task. What is left is the
 * delivery itself, which is the only thing they came for.
 *
 * The author does stay, at the head: a report names who wrote it, and that is a
 * different job from the avatar's job in a list row.
 *
 * The two actions stay because reading a report is not the end of the job: you
 * either ask the agent about it or leave a note for the next run. They sit under
 * the report rather than inside it, so they never compete with the content.
 */

interface TaskRunReportProps {
  activity: TaskDetailActivity;
}

const TaskRunReport = memo<TaskRunReportProps>(({ activity }) => {
  const { t } = useTranslation('chat');
  const openTopicDrawer = useTaskStore((s) => s.openTopicDrawer);
  const addComment = useTaskStore((s) => s.addComment);
  const activeTaskId = useTaskDetailTaskId();
  const [commenting, setCommenting] = useState(false);

  // A descendant run belongs to `sourceTaskId`, not the open parent.
  const runTaskId = activity.sourceTaskId ?? activeTaskId;

  const openConversation = useCallback(() => {
    if (!activity.id) return;
    openTopicDrawer(activity.id, {
      agentId:
        activity.author?.type === 'agent' ? activity.author.id : activity.agentId || undefined,
      title: activity.title,
    });
  }, [activity.agentId, activity.author, activity.id, activity.title, openTopicDrawer]);

  // A run that failed, timed out or was stopped often reports nothing at all;
  // the report then is why it ended. Otherwise nothing was reported yet and the
  // panel's own empty handling covers that case.
  const body = activity.content || activity.summary;
  const endedBadly = isRunEndedBadly(activity.status);
  if (!body && !endedBadly) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Who is reporting, at the top where a report names its author — not a
          footnote under the text it wrote. */}
      <div className="flex items-center gap-2">
        {activity.author?.type === 'agent' ? (
          <AssigneeAvatar agentId={activity.author.id} size={24} />
        ) : (
          <Avatar avatar={activity.author?.avatar || DEFAULT_AVATAR} size={24} />
        )}
        <div className="font-medium">
          {activity.author?.name ?? t('taskDetail.reportedByAgent')}
        </div>
      </div>
      {endedBadly && <RunFailureReason reason={activity.error} status={activity.status} />}
      {body && (
        <Markdown style={{ overflow: 'unset' }} variant={'chat'}>
          {body}
        </Markdown>
      )}

      {commenting ? (
        <RunReplyEditor
          onCancel={() => setCommenting(false)}
          onSubmit={async (text) => {
            if (!runTaskId) return;
            await addComment(runTaskId, text, { topicId: activity.id });
            setCommenting(false);
          }}
        />
      ) : (
        <div className="flex items-center justify-end gap-1">
          <ActionIcon
            icon={MessagesSquare}
            size={'small'}
            title={t('taskDetail.openRunChat')}
            onClick={openConversation}
          />
          {!!runTaskId && (
            <ActionIcon
              icon={MessageCircle}
              size={'small'}
              title={t('taskDetail.runFollowUp')}
              onClick={() => setCommenting(true)}
            />
          )}
        </div>
      )}
    </div>
  );
});

TaskRunReport.displayName = 'TaskRunReport';

export default TaskRunReport;
