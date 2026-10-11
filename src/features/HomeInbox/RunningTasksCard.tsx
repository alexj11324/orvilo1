import { cn } from 'cn';
import { ChevronDownIcon, ChevronRightIcon } from 'lucide-react';
import { createElement, memo, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import { homeType } from '@/features/Home/components/homeType';
import RunningGlyph from '@/features/Home/components/RunningGlyph';

import AuthorChip from './AuthorChip';
import TopicRow from './TopicRow';
import { type InboxTopic } from './useHomeInboxTopics';

const AVATAR_SIZE = 20;
/** Past this the stack turns into a smudge; the rest are counted instead. */
const MAX_AVATARS = 5;

const styles = {
  avatars: '[&>*:not(:first-child)]:-ms-1.5',
  bareRoot: '-my-1.5 -mx-2',
  body: 'pbs-1 pbe-2 px-2 border-bs border-divider',
  bareBody: 'px-0',
  card: 'overflow-hidden border border-divider rounded-(--radius-card) bg-card',
  head: 'flex-1 justify-start w-auto min-w-0 px-3.5 border-0 text-start text-sm leading-5.5 transition-[background] duration-(--orvilo-motion-mid) ease-[ease] [&:hover]:bg-accent',
  bareHead: 'px-2 rounded-(--radius-button)',
  overflowCount: 'flex-none ms-1 text-xs leading-5 text-foreground-tertiary',
  stackedAvatar: 'flex-none shadow-[0_0_0_2px_var(--card)]',
};

/** One avatar of the collapsed stack. Its own component because `useAgentDisplayMeta` is a hook and the stack is a list. */
const StackedAgentAvatar = memo<{ agentId: string }>(({ agentId }) => {
  const agent = useAgentDisplayMeta(agentId);
  if (!agent) return null;

  return (
    <span className={styles.stackedAvatar}>
      <AssigneeAvatar agentId={agentId} size={AVATAR_SIZE} />
    </span>
  );
});

/**
 * Who is working, without opening the card. A count alone ("3 tasks running")
 * says how much is in flight but not *whose* — and which agents are busy is the
 * thing the user actually recognises at a glance.
 */
const RunningAgentAvatars = memo<{ running: InboxTopic[] }>(({ running }) => {
  // One avatar per agent, not per topic: an agent running three topics is still
  // one face, and the count next to it already carries the volume.
  const agentIds = [...new Set(running.map((topic) => topic.agentId).filter(Boolean))] as string[];
  const shown = agentIds.slice(0, MAX_AVATARS);
  const overflow = agentIds.length - shown.length;

  if (shown.length === 0) return null;

  return (
    <div className={cn(styles.avatars, 'flex items-center flex-none')}>
      {shown.map((agentId) => (
        <StackedAgentAvatar agentId={agentId} key={agentId} />
      ))}
      {overflow > 0 && <span className={styles.overflowCount}>+{overflow}</span>}
    </div>
  );
});

interface RunningTasksCardProps {
  action?: ReactNode;
  /** Rendered inside a rail card, which already draws the shell. */
  bare?: boolean;
  running: InboxTopic[];
  /** Team view: tag each expanded row with whose run it is. */
  showAuthor?: boolean;
}

/**
 * Runs that are executing fine need no attention — so this collapses to a
 * single line by default and only opens on demand. Nothing here is actionable;
 * it exists so the user knows work is in flight.
 */
const RunningTasksCard = memo<RunningTasksCardProps>(({ action, bare, running, showAuthor }) => {
  const { t } = useTranslation('home');
  const [open, setOpen] = useState(false);

  if (running.length === 0) return null;

  return (
    <div className={cn(bare ? styles.bareRoot : styles.card, 'flex flex-col')}>
      <div className="flex items-center">
        <Button
          className={cn(cn(styles.head, bare && styles.bareHead))}
          variant="ghost"
          onClick={() => setOpen((v) => !v)}
        >
          <div className="flex w-full items-center gap-2.5">
            <RunningGlyph />
            <div className={cn('flex-1', homeType.itemTitle)}>
              {t('inbox.running.title', { count: running.length })}
            </div>
            <RunningAgentAvatars running={running} />
            {createElement(open ? ChevronDownIcon : ChevronRightIcon, {
              className: 'size-4 text-foreground-quaternary',
              size: 16,
            })}
          </div>
        </Button>
        {action}
      </div>

      {open && (
        <div className={cn(cn(styles.body, bare && styles.bareBody), 'flex flex-col')}>
          {running.map((topic) => (
            <TopicRow
              key={topic.id}
              leading={<RunningGlyph />}
              topic={topic}
              trailing={
                showAuthor ? (
                  <AuthorChip trigger={topic.trigger} userId={topic.userId} />
                ) : undefined
              }
            />
          ))}
        </div>
      )}
    </div>
  );
});

export default RunningTasksCard;
