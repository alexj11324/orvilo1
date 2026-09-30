'use client';

import type { TopicIssue } from '@orvilo/conversation-flow';
import { createStaticStyles, cssVar, cx } from 'antd-style';
import { CircleAlert, CircleCheck, EyeOff, Stethoscope } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useSWR from 'swr';

import { useModalContext } from '@/components/Modal';
import { toast } from '@/components/toast';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { messageService } from '@/services/message';
import { useChatStore } from '@/store/chat';

export interface TopicDoctorContentProps {
  agentId?: string | null;
  topicId: string;
}

const styles = createStaticStyles(({ css }) => ({
  issue: css`
    padding: 12px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;
  `,
}));

const TopicDoctorContent = memo<TopicDoctorContentProps>(({ agentId, topicId }) => {
  const { t } = useTranslation(['topic', 'common']);
  const { close } = useModalContext();
  const refreshMessages = useChatStore((s) => s.refreshMessages);

  const [repairing, setRepairing] = useState(false);

  const { data, error, isLoading, mutate } = useSWR(['topic-doctor', agentId, topicId], () =>
    messageService.diagnoseTopic({ agentId, topicId }),
  );

  if (isLoading)
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map((row) => (
          <Skeleton className="h-4" key={row} style={{ width: row === 2 ? '60%' : '100%' }} />
        ))}
      </div>
    );

  // Without this the check failing would leave the skeleton up forever: SWR clears `isLoading`
  // but never produces `data`, so a `!data` skeleton has no way back.
  if (error || !data)
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <CircleAlert color={cssVar.colorError} size={32} />
        <div>{t('doctor.checkFailed')}</div>
        <Button onClick={() => mutate()}>{t('retry', { ns: 'common' })}</Button>
      </div>
    );

  const { hiddenCount, issues, patch } = data;

  if (issues.length === 0)
    return (
      <div className="flex flex-col items-center gap-3 py-6">
        <CircleCheck color={cssVar.colorSuccess} size={32} />
        <div>{t('doctor.healthy')}</div>
      </div>
    );

  const describe = (issue: TopicIssue) => {
    const count = issue.hiddenMessageIds.length;
    switch (issue.kind) {
      case 'concurrent-fork': {
        return t('doctor.issue.concurrent-fork', { count });
      }
      case 'stale-branch-index': {
        return t('doctor.issue.stale-branch-index', { count });
      }
      case 'orphan-signal-turn': {
        return t('doctor.issue.orphan-signal-turn', { count });
      }
      // Nothing is hidden here — the section renders, but on its own root: out of order and
      // cut off from the model's context. The count is the section being reconnected.
      case 'segment-split': {
        return t('doctor.issue.segment-split', {
          count: issue.reattachedMessageIds?.length ?? 0,
        });
      }
      // The one shape that cannot be undone: these rows reached the database with nothing in
      // them, so the text is simply gone.
      case 'lost-content': {
        return t('doctor.issue.lostContent', { count: issue.lostMessageIds?.length ?? 0 });
      }
    }
  };

  const handleRepair = async () => {
    setRepairing(true);
    try {
      const { restoredMessageIds } = await messageService.repairTopic({ agentId, topicId });
      await refreshMessages({ agentId: agentId ?? undefined, topicId });
      toast.success(t('doctor.repaired', { count: restoredMessageIds.length }));
      close();
    } catch {
      toast.error(t('doctor.repairFailed'));
    } finally {
      setRepairing(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {hiddenCount > 0 && (
        <div className="flex items-center gap-2">
          <EyeOff color={cssVar.colorWarning} />
          <div>{t('doctor.summary', { count: hiddenCount })}</div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {issues.map((issue) => (
          <div className={cx(styles.issue, 'flex items-start gap-2')} key={issue.messageId}>
            <CircleAlert
              style={{ color: issue.repairable ? cssVar.colorWarning : cssVar.colorTextQuaternary }}
            />
            <div className="flex flex-col gap-0.5">
              <div>{describe(issue)}</div>
              {!issue.repairable && (
                <div className="text-muted-foreground">{t('doctor.notRepairable')}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="flex gap-2 justify-end">
        <Button onClick={close}>{t('cancel', { ns: 'common' })}</Button>
        <Button disabled={patch.length === 0} loading={repairing} onClick={handleRepair}>
          <Stethoscope data-icon="inline-start" />
          {t('doctor.repair')}
        </Button>
      </div>
    </div>
  );
});

TopicDoctorContent.displayName = 'TopicDoctorContent';

export default TopicDoctorContent;
