'use client';

import { Flexbox, Icon, Tooltip } from '@lobehub/ui';
import { Text } from '@lobehub/ui/base-ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { Bot } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import {
  type ActorPresenceSummary,
  type CollaborationRoom,
  dedupePresenceByActor,
  useCollaborationStore,
} from '@/store/collaboration';
import { roomKey } from '@/store/collaboration';

const styles = createStaticStyles(({ css }) => ({
  agentBadge: css`
    position: absolute;
    inset-block-end: -2px;
    inset-inline-end: -2px;

    display: flex;
    align-items: center;
    justify-content: center;

    width: 12px;
    height: 12px;
    border: 1.5px solid ${cssVar.colorBgContainer};
    border-radius: 50%;

    color: ${cssVar.colorBgContainer};

    background: ${cssVar.colorPrimary};
  `,
  avatarCell: css`
    position: relative;
    flex-shrink: 0;
    border: 1.5px solid ${cssVar.colorBgContainer};
    border-radius: 50%;
  `,
  countChip: css`
    display: flex;
    align-items: center;
    justify-content: center;

    height: 22px;
    padding-inline: 6px;
    border: 1.5px solid ${cssVar.colorBgContainer};
    border-radius: 999px;

    font-size: 11px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorFillSecondary};
  `,
  stack: css`
    display: flex;
    flex-direction: row-reverse;
    align-items: center;

    > * {
      margin-inline-start: -6px;
    }
  `,
}));

const MAX_AVATARS = 5;

const actorLabel = (summary: ActorPresenceSummary): string =>
  summary.actor.name || summary.actor.id;

/**
 * Live presence strip for a room. Same identity in N tabs collapses to one
 * avatar (the connection count is in the tooltip, not extra avatars); agents
 * get a bot badge so a running delegation never reads as a person.
 */
export const PresenceAvatarStack = memo<{ room: CollaborationRoom | null }>(({ room }) => {
  const { t } = useTranslation('common');
  const key = room ? roomKey(room) : null;
  const presence = useCollaborationStore((s) => (key ? s.rooms[key]?.presence : undefined));

  const summaries = useMemo(() => dedupePresenceByActor(presence ?? {}), [presence]);

  if (!room || summaries.length === 0) return null;

  const visible = summaries.slice(0, MAX_AVATARS);
  const overflow = summaries.length - visible.length;

  return (
    <Flexbox align="center" className={styles.stack} gap={0}>
      {visible.map((summary) => {
        const isAgent = summary.actor.kind === 'agent';
        return (
          <Tooltip
            key={summary.connectionId}
            title={t('teammates.presence.actorTooltip', {
              count: summary.connectionCount,
              name: actorLabel(summary),
            })}
          >
            <span className={styles.avatarCell}>
              {isAgent ? (
                <Avatar
                  avatar={summary.actor.avatar}
                  name={actorLabel(summary)}
                  size={22}
                  title={actorLabel(summary)}
                />
              ) : (
                <Avatar
                  avatar={summary.actor.avatar}
                  name={actorLabel(summary)}
                  size={22}
                  title={actorLabel(summary)}
                />
              )}
              {isAgent && (
                <span className={styles.agentBadge}>
                  <Icon icon={Bot} size={8} />
                </span>
              )}
            </span>
          </Tooltip>
        );
      })}
      {overflow > 0 && (
        <span className={styles.countChip}>
          <Text as="span">+{overflow}</Text>
        </span>
      )}
    </Flexbox>
  );
});

PresenceAvatarStack.displayName = 'PresenceAvatarStack';
