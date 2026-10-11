'use client';

import { BellIcon, BellRingIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { workAttentionService } from '@/services/workAttention';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';

import { getIssueSubscriptionView } from './issueSubscription';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

/**
 * The reader's own subscription to this Issue. Like the favourite star it is
 * never write-gated: a read-only viewer can follow or stop following. The
 * state rides on the detail payload (`isSubscribed`).
 */
const IssueSubscribeToggle = () => {
  const { t } = useTranslation(['chat', 'common']);
  const taskId = useTaskDetailTaskId();
  const task = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const refreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);
  // Tagged with the Issue it was requested on: a peek pane keeps this
  // instance mounted while its Issue changes.
  const [pending, setPending] = useState<{ taskUuid: string; value: boolean }>();
  const taskUuid = task?.id;
  const view = getIssueSubscriptionView(
    task?.isSubscribed,
    pending && pending.taskUuid === taskUuid ? pending.value : undefined,
  );
  const busy = !!pending && pending.taskUuid === taskUuid;

  const toggle = async () => {
    if (!taskUuid || !taskId || busy) return;
    setPending({ taskUuid, value: !view.subscribed });
    try {
      if (view.subscribed) await workAttentionService.unsubscribe(taskUuid);
      else await workAttentionService.subscribe(taskUuid);
      // The write is done; a failed re-read is not a failed subscription.
      await refreshTaskDetail(taskId).catch(() => {});
    } catch {
      toast.error(t(view.failedKey, { ns: 'common' }));
    } finally {
      // Leave a request made since on another Issue alone.
      setPending((current) => (current?.taskUuid === taskUuid ? undefined : current));
    }
  };

  const Glyph = view.subscribed ? BellRingIcon : BellIcon;
  return (
    <Button
      aria-label={t(view.actionKey, { ns: 'common' })}
      aria-pressed={view.subscribed}
      data-subscribed={view.subscribed}
      disabled={!taskUuid || busy}
      size="icon-sm"
      title={t(view.stateKey)}
      variant="ghost"
      onClick={() => void toggle()}
    >
      <Glyph aria-hidden />
    </Button>
  );
};

export default IssueSubscribeToggle;
