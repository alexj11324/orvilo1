import { cn } from 'cn';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Textarea } from '@/components/ui/textarea';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { styles } from '../shared/style';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import { useIssueDetailCapabilities } from './useIssueDetailActions';
import { useTaskTitleAutosave } from './useTaskTitleAutosave';

const TaskDetailTitleInput = memo(() => {
  const { t } = useTranslation('chat');
  const { readOnly } = useIssueDetailCapabilities();
  const canEditTask = !readOnly;
  const name = useTaskDetailSelector(taskDetailSelectors.taskName);
  const taskId = useTaskDetailTaskId();
  const updateTask = useTaskStore((s) => s.updateTask);

  const [localName, setLocalName] = useState(name ?? '');

  const { flush, hasPendingEdit, notifyTitleEdit } = useTaskTitleAutosave({
    editable: canEditTask,
    taskId,
    updateTask,
  });

  useEffect(() => {
    // A queued or in-flight edit means the draft on screen is newer than the
    // store's `name` — including right after a failed save rolled the
    // optimistic title back. Overwriting it would erase the user's edit.
    if (taskId && hasPendingEdit(taskId)) return;
    setLocalName(name ?? '');
  }, [hasPendingEdit, name, taskId]);

  const handleNameChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setLocalName(e.target.value);
      notifyTitleEdit(e.target.value);
    },
    [notifyTitleEdit],
  );

  // A reader gets the title as text, not a disabled field (Plane does the same).
  if (readOnly) {
    return (
      <h1 className={cn(styles.titleText, !name && 'text-muted-foreground')}>
        {name || t('taskDetail.titlePlaceholder')}
      </h1>
    );
  }

  return (
    <Textarea
      className={cn(styles.titleInput, 'min-h-0')}
      placeholder={t('taskDetail.titlePlaceholder')}
      rows={1}
      value={localName}
      onBlur={flush}
      onChange={handleNameChange}
    />
  );
});

export default TaskDetailTitleInput;
