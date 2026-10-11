import { RotateCcwIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import type { SidebarMenuItemData } from '@/features/NavPanel/components/SidebarDropdownMenu';
import { taskDetailSelectors } from '@/store/task/selectors';

import { canRerunIssue } from './issueExecution';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';
import { useRunWithContractCheck } from './useRunWithContractCheck';

/**
 * "Run again" for an Issue whose run already succeeded. A deliberate second
 * pass rather than the next step, so it sits in the overflow menu; it takes
 * the same contract-checked run path as Retry and Start.
 */
export const useIssueRerunMenuItem = (): SidebarMenuItemData | null => {
  const { t } = useTranslation('chat');
  const taskId = useTaskDetailTaskId();
  const detail = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const blocked = useTaskDetailSelector(taskDetailSelectors.isTaskBlocked);
  const { canExecuteTask, runWithContractCheck } = useRunWithContractCheck();
  const [pending, setPending] = useState(false);

  if (
    !taskId ||
    !detail ||
    !canRerunIssue({
      agentId: detail.agentId,
      dispatchPhase: detail.dispatchPhase,
      status: detail.status,
      workflowCategory: detail.workflowCategory,
    })
  )
    return null;

  const rerun = async () => {
    if (!canExecuteTask || blocked || pending) return;
    setPending(true);
    try {
      if ((await runWithContractCheck(taskId)) === 'failed')
        toast.error(t('taskDetail.execution.startFailed'));
    } finally {
      setPending(false);
    }
  };

  return {
    disabled: !canExecuteTask || blocked || pending,
    icon: <RotateCcwIcon />,
    key: 'rerun',
    label: t('taskDetail.menu.rerun'),
    onClick: () => void rerun(),
  };
};
