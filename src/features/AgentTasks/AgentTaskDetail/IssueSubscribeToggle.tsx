'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { useUserAvatar } from '@/hooks/useUserAvatar';
import { workAttentionService } from '@/services/workAttention';
import { useTaskStore } from '@/store/task';
import { taskDetailSelectors } from '@/store/task/selectors';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { getIssueSubscriptionView } from './issueSubscription';
import { useTaskDetailSelector, useTaskDetailTaskId } from './TaskDetailScope';

/**
 * The reader's own subscription to this Issue. Like the favourite star it is
 * never write-gated: a read-only viewer can follow or stop following. The
 * state rides on the detail payload (`isSubscribed`).
 *
 * Mounted in the Activity section header's right cluster, matching Linear's
 * "Unsubscribe + avatar". The avatar is the viewer's own — the detail payload
 * carries only the viewer's subscription flag, not the subscriber list, so a
 * real subscriber stack stays product-pending; when unsubscribed there is no
 * avatar to claim and only the text link shows.
 */
const IssueSubscribeToggle = () => {
  const { t } = useTranslation(['chat', 'common']);
  const taskId = useTaskDetailTaskId();
  const task = useTaskDetailSelector(taskDetailSelectors.taskDetail);
  const refreshTaskDetail = useTaskStore((s) => s.internal_refreshTaskDetail);
  const userAvatar = useUserAvatar();
  const displayName = useUserStore(userProfileSelectors.displayUserName);
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

  // Linear presents the subscription as a quiet "Subscribe"/"Unsubscribe"
  // text link in the Activity header. The visible label names the button, so
  // no aria-label.
  return (
    <>
      <Button
        aria-pressed={view.subscribed}
        data-subscribed={view.subscribed}
        disabled={!taskUuid || busy}
        size="sm"
        title={t(view.stateKey)}
        variant="ghost"
        onClick={() => void toggle()}
      >
        {t(view.actionKey, { ns: 'common' })}
      </Button>
      {view.subscribed && (
        <Avatar avatar={userAvatar} name={displayName} size={20} title={t(view.stateKey)} />
      )}
    </>
  );
};

export default IssueSubscribeToggle;
