'use client';

import { Bot } from 'lucide-react';
import { memo, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  type ActorPresenceSummary,
  type CollaborationRoom,
  dedupePresenceByActor,
  useCollaborationStore,
} from '@/store/collaboration';
import { roomKey } from '@/store/collaboration';

const styles = {
  agentBadge:
    'absolute -inset-be-0.5 -inset-e-0.5 flex items-center justify-center size-5 border-[1.5px] border-card rounded-full text-primary-foreground bg-primary',
  avatarCell: 'relative shrink-0 border-[1.5px] border-card rounded-full',
  countChip:
    'flex items-center justify-center min-h-6 px-1.5 border-[1.5px] border-card rounded-full text-xs leading-5 text-muted-foreground bg-muted',
  stack: 'flex flex-row-reverse items-center gap-0 [&>*]:-ms-1.5',
};

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
    <div className={styles.stack}>
      {visible.map((summary) => {
        const isAgent = summary.actor.kind === 'agent';
        return (
          <TooltipProvider key={summary.actor.id}>
            <Tooltip>
              <TooltipTrigger
                render={
                  <span className="inline-flex">
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
                          <Bot size={16} />
                        </span>
                      )}
                    </span>
                  </span>
                }
              />
              <TooltipContent>
                {t('teammates.presence.actorTooltip', {
                  count: summary.connectionCount,
                  name: actorLabel(summary),
                })}
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        );
      })}
      {overflow > 0 && (
        <span className={styles.countChip}>
          <span>+{overflow}</span>
        </span>
      )}
    </div>
  );
});

PresenceAvatarStack.displayName = 'PresenceAvatarStack';
