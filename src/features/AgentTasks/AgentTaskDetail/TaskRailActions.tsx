'use client';

import { ActionIcon } from '@lobehub/ui/base-ui';
import { CopyIcon, GitBranchIcon, LinkIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { taskDetailLayoutStyles as styles } from './taskDetailLayoutStyles';
import { useTaskCopyActions } from './useTaskCopyActions';

/** Linear's round rail buttons — one clear hit area per clipboard action. */
const RAIL_BUTTON_SIZE = { blockSize: 32, borderRadius: '50%', size: 15 } as const;

/**
 * The rail's quick actions: copy link / copy ID, plus copy `task/<identifier>`
 * when the task is bound to a repo workspace (the only case where a branch
 * exists — see `useTaskCopyActions.hasBranch`). Lives at the top of the
 * properties rail, where the reference parks its round action row; it mounts
 * inside `IssueContent`, so the inbox/My-Work panes get the same affordances.
 * There is deliberately no fourth button: Linear's subscriber facepile has no
 * per-task read API here, and rendering a control without state would lie.
 */
const TaskRailActions = memo(() => {
  const { t } = useTranslation('chat');
  const { copyBranch, copyId, copyLink, hasBranch, taskId } = useTaskCopyActions();

  if (!taskId) return null;

  return (
    <div className={styles.railActions}>
      <ActionIcon
        icon={LinkIcon}
        size={RAIL_BUTTON_SIZE}
        title={t('taskList.contextMenu.copyLink')}
        tooltipProps={{ placement: 'bottom' }}
        variant={'outlined'}
        onClick={copyLink}
      />
      <ActionIcon
        icon={CopyIcon}
        size={RAIL_BUTTON_SIZE}
        title={t('taskList.contextMenu.copyId')}
        tooltipProps={{ placement: 'bottom' }}
        variant={'outlined'}
        onClick={copyId}
      />
      {hasBranch && (
        <ActionIcon
          icon={GitBranchIcon}
          size={RAIL_BUTTON_SIZE}
          title={t('taskDetail.copyBranch')}
          tooltipProps={{ placement: 'bottom' }}
          variant={'outlined'}
          onClick={copyBranch}
        />
      )}
    </div>
  );
});

TaskRailActions.displayName = 'TaskRailActions';

export default TaskRailActions;
