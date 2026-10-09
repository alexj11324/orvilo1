import { createStaticStyles, cssVar, cx } from 'antd-style';
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
const ROW_GAP = 10;
const ROW_PADDING_INLINE = 14;
const BARE_PADDING_INLINE = 8;

const styles = createStaticStyles(({ css, cssVar }) => ({
  bareGroupLabel: css`
    padding-inline: ${BARE_PADDING_INLINE}px;
  `,
  bareList: css`
    margin-inline: -${BARE_PADDING_INLINE}px;
  `,
  bareRow: css`
    padding-block: 7px;
    padding-inline: ${BARE_PADDING_INLINE}px;
    border-radius: ${cssVar.borderRadius};
  `,
  glyph: css`
    display: flex;
    flex: none;
    align-items: center;
  `,
  // The bucket a row belongs to is the one thing a goal glance must not make the
  // reader infer, so each pile is named — even when it holds a single row.
  groupLabel: css`
    padding-block: 8px 2px;
    padding-inline: ${ROW_PADDING_INLINE}px;
  `,
  list: css`
    overflow: hidden;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: ${cssVar.borderRadiusLG};
    background: ${cssVar.colorBgContainer};
  `,
  rounds: css`
    flex: none;
    font-variant-numeric: tabular-nums;
  `,
  row: css`
    justify-content: flex-start;

    width: 100%;
    height: auto;
    padding-block: 9px;
    padding-inline: ${ROW_PADDING_INLINE}px;
    border: 0;

    text-align: start;

    transition: background ${cssVar.motionDurationFast};

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
}));

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
      className={cn(cx(styles.row, bare && styles.bareRow))}
      disabled={!href}
      variant="ghost"
      onClick={() => href && navigate(href)}
    >
      <div className="flex items-center" style={{ gap: ROW_GAP, width: '100%' }}>
        {/* The pile heading says which of the two states this is; the glyph
            carries the exact one (verifying, planning, waiting) on hover, where
            it costs the row nothing. */}
        <span className={styles.glyph} title={t(entry.statusKey, { ns: 'chat' })}>
          {entry.bucket === 'running' ? (
            <RunningGlyph />
          ) : (
            <TargetIcon color={cssVar.colorInfo} size={16} />
          )}
        </span>
        <div
          className={cn('truncate', 'block', homeType.itemTitle)}
          style={{ flex: 1, minWidth: 0 }}
        >
          {entry.title}
        </div>
        <GoalAgentAvatar agentId={entry.agentId} />
        {/* A goal is measured in the tasks it has closed, not in time — how far
            through its own decomposition it is says more at a glance. */}
        <span className={cx(homeType.meta, styles.rounds)}>
          {entry.pendingDecisions > 0
            ? t('goalList.needsYou', { count: entry.pendingDecisions, ns: 'chat' })
            : t('goalList.taskProgress', {
                done: entry.taskDone,
                ns: 'chat',
                total: entry.taskTotal,
              })}
        </span>
        <ChevronRightIcon color={cssVar.colorTextQuaternary} size={14} />
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
    <div className={cx(bare ? styles.bareList : styles.list, 'flex flex-col')}>
      {buckets.map(({ bucket, entries: rows, total }) => (
        <div className="flex flex-col" key={bucket}>
          <div
            className={cx(
              cx(styles.groupLabel, bare && styles.bareGroupLabel),
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
          className={cn(cx(styles.row, bare && styles.bareRow, homeType.supporting))}
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
