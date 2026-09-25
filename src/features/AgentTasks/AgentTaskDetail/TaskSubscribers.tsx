import { Flexbox, Icon } from '@lobehub/ui';
import { Popover, Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Bell, BellOff, Check, Users } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useWorkspaceMembers } from '@/business/client/hooks/useWorkspaceMembers';
import Avatar from '@/components/Avatar';
import { useSingleton } from '@/hooks/useSingleton';
import { lambdaClient } from '@/libs/trpc/client';
import { useUserStore } from '@/store/user';
import { userProfileSelectors } from '@/store/user/selectors';

import { actionLinkStyles } from './actionLinkStyles';

const styles = createStaticStyles(({ css, cssVar }) => ({
  avatarStack: css`
    display: flex;
    align-items: center;

    > * + * {
      margin-inline-start: -6px;
    }
  `,
  avatarStackBtn: css`
    cursor: pointer;

    display: inline-flex;
    align-items: center;

    padding: 0;
    border: none;
    border-radius: 999px;

    background: transparent;

    transition: opacity ${cssVar.motionDurationFast};

    &:hover {
      opacity: 0.8;
    }
  `,
  overflowCount: css`
    display: inline-flex;
    align-items: center;
    justify-content: center;

    box-sizing: border-box;
    min-width: 18px;
    height: 18px;
    padding-inline: 3px;
    border: 1.5px solid ${cssVar.colorBgContainer};
    border-radius: 999px;

    font-size: 10px;
    font-weight: 500;
    line-height: 1;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillSecondary};
  `,
  memberRow: css`
    cursor: pointer;

    display: flex;
    gap: 8px;
    align-items: center;

    padding-block: 5px;
    padding-inline: 8px;
    border-radius: ${cssVar.borderRadius};

    font-size: 13px;
    color: ${cssVar.colorText};

    &:hover {
      background: ${cssVar.colorFillSecondary};
    }
  `,
  memberList: css`
    overflow-y: auto;
    max-width: 280px;
    max-height: 320px;
  `,
}));

interface Subscriber {
  userId: string;
}

const MAX_AVATARS = 5;

/**
 * The issue's notification row under the comment composer: subscribe /
 * unsubscribe for oneself, and the "Change subscribers" manager any
 * workspace member can use on anyone — the bell-strip Linear keeps on every
 * issue feed.
 */
const TaskSubscribers = memo<{ taskId: string }>(({ taskId }) => {
  const { t } = useTranslation('chat');
  const selfUserId = useUserStore(userProfileSelectors.userId);
  const members = useWorkspaceMembers();
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [manageOpen, setManageOpen] = useState(false);
  // One in-flight mutation per user — overlapping toggles can commit out of
  // order and leave the durable state opposite to what the row shows.
  const pending = useSingleton(() => new Set<string>());

  const refresh = useCallback(async () => {
    try {
      const rows = await lambdaClient.workAttention.subscribers.query({ taskId });
      setSubscribers(rows);
    } catch {
      // A failed roster read must not break the composer — leave the last
      // snapshot in place.
    }
  }, [taskId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const subscribedIds = useMemo(() => new Set(subscribers.map((s) => s.userId)), [subscribers]);
  const selfSubscribed = selfUserId ? subscribedIds.has(selfUserId) : false;
  const memberById = useMemo(() => new Map(members.map((m) => [m.userId, m])), [members]);

  const setSubscribed = useCallback(
    async (userId: string, subscribed: boolean) => {
      if (pending.has(userId)) return;
      pending.add(userId);
      setSubscribers((prev) =>
        subscribed
          ? [...prev.filter((s) => s.userId !== userId), { userId }]
          : prev.filter((s) => s.userId !== userId),
      );
      try {
        await lambdaClient.workAttention.setSubscriber.mutate({ subscribed, taskId, userId });
      } catch {
        // Fall through to the reconcile below.
      }
      pending.delete(userId);
      // The server roster is the truth after the mutation settles — refresh on
      // success too so an optimistic snapshot can never outlive a stale write.
      await refresh();
    },
    [pending, refresh, taskId],
  );

  const memberName = (userId: string) => {
    const member = memberById.get(userId);
    return member?.user?.fullName ?? member?.user?.username ?? userId;
  };

  const manageContent = (
    <Flexbox className={styles.memberList}>
      {members.map((member) => (
        <div
          className={styles.memberRow}
          key={member.userId}
          onClick={() => void setSubscribed(member.userId, !subscribedIds.has(member.userId))}
        >
          <Avatar
            avatar={member.user?.avatar || undefined}
            name={memberName(member.userId)}
            shape={'circle'}
            size={20}
          />
          <Text ellipsis style={{ flex: 1, minWidth: 0 }}>
            {memberName(member.userId)}
          </Text>
          {subscribedIds.has(member.userId) && (
            <Icon color={cssVar.colorTextSecondary} icon={Check} size={14} />
          )}
        </div>
      ))}
    </Flexbox>
  );

  return (
    <Flexbox horizontal align="center" gap={12}>
      <button
        className={actionLinkStyles.actionLink}
        type="button"
        onClick={() => selfUserId && void setSubscribed(selfUserId, !selfSubscribed)}
      >
        {selfSubscribed ? <Bell size={13} /> : <BellOff size={13} />}
        {selfSubscribed
          ? t('taskDetail.subscribers.unsubscribe', { defaultValue: 'Unsubscribe' })
          : t('taskDetail.subscribers.subscribe', { defaultValue: 'Subscribe' })}
      </button>
      {members.length > 0 && (
        <Popover
          arrow={false}
          content={manageContent}
          open={manageOpen}
          placement="bottomRight"
          trigger="click"
          onOpenChange={setManageOpen}
        >
          <button
            aria-label={t('taskDetail.subscribers.change', { defaultValue: 'Change subscribers' })}
            className={styles.avatarStackBtn}
            title={t('taskDetail.subscribers.change', { defaultValue: 'Change subscribers' })}
            type="button"
          >
            {subscribers.length > 0 ? (
              <div className={styles.avatarStack}>
                {subscribers.slice(0, MAX_AVATARS).map((s) => (
                  <Avatar
                    avatar={memberById.get(s.userId)?.user?.avatar || undefined}
                    key={s.userId}
                    name={memberName(s.userId)}
                    shape={'circle'}
                    size={18}
                    title={memberName(s.userId)}
                  />
                ))}
                {subscribers.length > MAX_AVATARS && (
                  <span
                    className={styles.overflowCount}
                    title={subscribers
                      .slice(MAX_AVATARS)
                      .map((s) => memberName(s.userId))
                      .join(', ')}
                  >
                    +{subscribers.length - MAX_AVATARS}
                  </span>
                )}
              </div>
            ) : (
              <span className={actionLinkStyles.actionLink}>
                <Users size={13} />
                {t('taskDetail.subscribers.change', { defaultValue: 'Change subscribers' })}
              </span>
            )}
          </button>
        </Popover>
      )}
    </Flexbox>
  );
});

export default TaskSubscribers;
