import { cn } from 'cn';
import { ChevronRightIcon, TargetIcon } from 'lucide-react';
import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { useAgentDisplayMeta } from '@/features/AgentTasks/shared/useAgentDisplayMeta';
import { homeType } from '@/features/Home/components/homeType';
import RunningGlyph from '@/features/Home/components/RunningGlyph';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import { type HomeGoalEntry, homeGoalHref, resolveHomeGoalView } from './homeGoals';

const AVATAR_SIZE = 20;

const styles = {
  bareGroupLabel: 'px-2',
  bareList: '-mx-2',
  bareRow: 'px-2 rounded-(--radius-button)',
  glyph: 'flex flex-none items-center',
  groupLabel: 'pbs-2 pbe-0.5 px-3.5',
  list: 'overflow-hidden border border-divider rounded-(--radius-card) bg-card',
  rounds: 'flex-none tabular-nums',
  row: 'justify-start w-full px-3.5 border-0 text-start text-sm leading-5.5 transition-[background] duration-(--orvilo-motion-mid) ease-[ease] [&:hover]:bg-accent',
};

/** The agent behind the goal — the face is what makes a long-running goal recognisable. */
const GoalAgentAvatar = memo<{ agentId: string | null }>(({ agentId }) => {
  const agent = useAgentDisplayMeta(agentId);
  if (!agent) return null;

  return <AssigneeAvatar agentId={agentId} size={AVATAR_SIZE} />;
});

interface GoalRowProps {
  bare?: boolean;
  entry: HomeGoalEntry;
}

const GoalRow = memo<GoalRowProps>(({ bare, entry }) => {
  const { t } = useTranslation(['home', 'chat']);
  const navigate = useWorkspaceAwareNavigate();
  const href = homeGoalHref(entry);

  return (
    <Button
      className={cn(cn(styles.row, bare && styles.bareRow))}
      disabled={!href}
      size="lg"
      variant="ghost"
      onClick={() => href && navigate(href)}
    >
      <div className="flex w-full items-center gap-2.5">
        {/* The pile heading says which of the two states this is; the glyph
            carries the exact one (planning, waiting) on hover, where
            it costs the row nothing. */}
        <span className={styles.glyph} title={t(entry.statusKey, { ns: 'chat' })}>
          {entry.bucket === 'running' ? (
            <RunningGlyph />
          ) : (
            <TargetIcon className="text-info-text" size={16} />
          )}
        </span>
        <div className={cn('truncate', 'block', 'flex-1 min-w-0', homeType.itemTitle)}>
          {entry.title}
        </div>
        <GoalAgentAvatar agentId={entry.agentId} />
        {/* A goal is measured in the tasks it has closed, not in time — how far
            through its own decomposition it is says more at a glance. */}
        <span className={cn(homeType.meta, styles.rounds)}>
          {entry.pendingDecisions > 0
            ? t('goalList.needsYou', { count: entry.pendingDecisions, ns: 'chat' })
            : t('goalList.taskProgress', {
                done: entry.taskDone,
                ns: 'chat',
                total: entry.taskTotal,
              })}
        </span>
        <ChevronRightIcon className="size-4 text-foreground-quaternary" size={16} />
      </div>
    </Button>
  );
});

interface GoalsRailCardProps {
  /** Rendered inside a rail card, which already draws the shell. */
  bare?: boolean;
  entries: HomeGoalEntry[];
}

/**
 * Goals outlive the sessions that created them, so unlike a run they have
 * nowhere to surface on their own: this is the standing place to see the ones
 * still in flight. Two piles only — waiting on you, and working — because those
 * are the states a long-horizon goal is *open* in; the rest are history and live
 * on the agent's own goal page.
 */
const GoalsRailCard = memo<GoalsRailCardProps>(({ bare, entries }) => {
  const { t } = useTranslation('home');
  const [expanded, setExpanded] = useState(false);

  if (entries.length === 0) return null;

  const { buckets, collapsed } = resolveHomeGoalView(entries, expanded);

  return (
    <div className={cn(bare ? styles.bareList : styles.list, 'flex flex-col')}>
      {buckets.map(({ bucket, entries: rows, total }) => (
        <div className="flex flex-col" key={bucket}>
          <div
            className={cn(
              cn(styles.groupLabel, bare && styles.bareGroupLabel),
              'flex items-center gap-1.5',
            )}
          >
            <span className={homeType.sectionLabel}>
              {t(bucket === 'review' ? 'inbox.goals.review' : 'inbox.goals.running')}
            </span>
            <span className={homeType.badge}>{total}</span>
          </div>
          {rows.map((entry) => (
            <GoalRow bare={bare} entry={entry} key={entry.id} />
          ))}
        </div>
      ))}
      {collapsed && (
        <Button
          className={cn(cn(styles.row, bare && styles.bareRow, homeType.supporting))}
          size="lg"
          variant="ghost"
          onClick={() => setExpanded(true)}
        >
          {t('inbox.goals.showAll', { count: entries.length })}
        </Button>
      )}
    </div>
  );
});

export default GoalsRailCard;
