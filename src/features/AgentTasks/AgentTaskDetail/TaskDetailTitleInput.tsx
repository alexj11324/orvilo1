import { Input } from 'antd';
import { memo, useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { usePermission } from '@/hooks/usePermission';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { styles } from '../shared/style';
import { useTaskTitleAutosave } from './useTaskTitleAutosave';

const TaskDetailTitleInput = memo(() => {
  const { t } = useTranslation('chat');
  const { allowed: canEditTask } = usePermission('create_content');
  const name = useTaskStore(taskDetailSelectors.activeTaskName);
  const taskId = useTaskStore(taskDetailSelectors.activeTaskId);
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

  return (
    <Input.TextArea
      autoSize={{ minRows: 1 }}
      className={styles.titleInput}
      disabled={!canEditTask}
      placeholder={t('taskDetail.titlePlaceholder')}
      value={localName}
      variant={'borderless'}
      onBlur={flush}
      onChange={handleNameChange}
    />
  );
});

export default TaskDetailTitleInput;
