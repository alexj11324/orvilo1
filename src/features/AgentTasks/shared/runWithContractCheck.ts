import { t } from 'i18next';

import { confirmModal } from '@/components/Modal';
import { taskService } from '@/services/task';

/** `canceled`: the reader declined the pending-contract-edits confirmation. */
export type RunWithContractCheckResult = 'canceled' | 'failed' | 'started';

type RunTask = (id: string, options?: { intent: 'repair' }) => Promise<unknown>;

/**
 * Contract-aware run (SB08): when goal/acceptance drifted from the adopted
 * contract's revisions, the run is explicitly a frozen-contract `repair`
 * and the user is told the edits stay pending for an approved replan — a
 * run never silently adopts or ignores constraint changes.
 *
 * Shared by every start a person causes on an Issue: the Execution area's
 * Start / Retry / Resume, the overflow menu's Run again, and the run a move
 * to In Progress starts.
 */
export const runTaskWithContractCheck = async (
  id: string,
  runTask: RunTask,
): Promise<RunWithContractCheckResult> => {
  const context = await taskService.contractContext({ id }).catch(() => undefined);
  if (!context?.data?.pendingConstraintEdits) return (await runTask(id)) ? 'started' : 'failed';

  const revision = context.data.contract?.revision;
  const confirmed = await new Promise<boolean>((resolve) => {
    confirmModal({
      cancelText: t('cancel', { ns: 'common' }),
      content: t('taskDetail.pendingContractEdits.content', {
        ns: 'chat',
        revision: revision ?? '?',
      }),
      okText: t('taskDetail.runNow', { ns: 'chat' }),
      onCancel: () => resolve(false),
      onOk: () => resolve(true),
      title: t('taskDetail.pendingContractEdits.title', { ns: 'chat' }),
    });
  });
  if (!confirmed) return 'canceled';
  return (await runTask(id, { intent: 'repair' })) ? 'started' : 'failed';
};
