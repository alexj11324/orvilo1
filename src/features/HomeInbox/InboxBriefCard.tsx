import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { memo } from 'react';

import AssigneeAvatar from '@/features/AgentTasks/features/AssigneeAvatar';
import { taskDetailPath } from '@/features/AgentTasks/shared/taskDetailPath';
import BriefCardActions from '@/features/DailyBrief/BriefCardActions';
import BriefCardArtifacts from '@/features/DailyBrief/BriefCardArtifacts';
import BriefCardSummary from '@/features/DailyBrief/BriefCardSummary';
import { styles as briefStyles } from '@/features/DailyBrief/style';
import { type BriefItem } from '@/features/DailyBrief/types';
import { homeType } from '@/features/Home/components/homeType';
import Time from '@/features/Home/components/Time';
import { useWorkspaceAwareNavigate } from '@/features/Workspace/useWorkspaceAwareNavigate';

import StatusGlyph from './StatusGlyph';

const styles = createStaticStyles(({ css, cssVar }) => ({
  meta: css`
    cursor: pointer;
  `,
  taskName: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  taskRef: css`
    flex: none;
    font-family: ${cssVar.fontFamilyCode};
  `,
}));

interface InboxBriefCardProps {
  /** Rendered inside a rail card, which already draws the shell. */
  bare?: boolean;
  brief: BriefItem;
}

/**
 * One row of "Needs you". The meta line (what state, which task, when) sits on
 * top spanning the full width; the agent avatar sits next to the *content* it
 * produced, not next to the metadata.
 */
const InboxBriefCard = memo<InboxBriefCardProps>(({ bare, brief }) => {
  const navigate = useWorkspaceAwareNavigate();

  const agent = brief.agent;
  const canNavigate = Boolean(brief.taskId);

  // Error briefs carry their title + human, localized summary from the server
  // (taskLifecycle / verify / watchdog / agent-signal each own their copy), so
  // the card renders them verbatim — no client-side title override or string
  // munging. `isError` only drives the severity glyph below.
  const isError = brief.type === 'error';

  const hasTaskMeta = Boolean(brief.taskStatus || brief.taskIdentifier || brief.taskName);

  const openTask = () => {
    if (!brief.taskId) return;
    navigate(taskDetailPath(brief.taskId, brief.agentId ?? undefined, brief.taskName));
  };

  const content = (
    <>
      {/* A brief raised outside a task has no status / ref / name to show, which
          left the meta row as an empty band with a lone timestamp. Drop the row
          entirely in that case and let the title line carry the time. */}
      {hasTaskMeta && (
        <div
          className={cx(canNavigate ? styles.meta : undefined, 'flex items-center gap-[7px]')}
          onClick={canNavigate ? openTask : undefined}
        >
          {/* On error the task glyph would render its paused/scheduled state
              (the neutral "waiting for human" hand), which reads as pending, not
              failed. Show the topic-failed alert (red TriangleAlert) so the row
              reads as an error at a glance — the one true failure glyph, no extra
              icon on the headline. */}
          {isError ? (
            <StatusGlyph status={'failed'} variant={'topic'} />
          ) : (
            brief.taskStatus && <StatusGlyph status={brief.taskStatus} variant={'task'} />
          )}
          {brief.taskIdentifier && (
            <span className={cx(homeType.meta, styles.taskRef)}>{brief.taskIdentifier}</span>
          )}
          {brief.taskName && (
            <span className={cx(homeType.meta, styles.taskName)}>{brief.taskName}</span>
          )}
          <div className="flex flex-col flex-1" />
          <Time date={brief.createdAt} />
        </div>
      )}

      <div className="flex items-start gap-2.5">
        {agent && <AssigneeAvatar agentId={agent.id} size={28} />}
        <div className="flex flex-col flex-1 gap-1.5" style={{ minWidth: 0 }}>
          <div className="flex items-center gap-2">
            <div
              className={cn('truncate', 'block', homeType.itemTitle)}
              style={{ flex: 1, minWidth: 0 }}
            >
              {brief.title}
            </div>
            {!hasTaskMeta && <Time date={brief.createdAt} />}
          </div>
          <BriefCardSummary summary={brief.summary} />
          <BriefCardArtifacts artifacts={brief.artifacts} />
        </div>
      </div>

      <BriefCardActions
        actions={brief.actions}
        agentId={brief.agentId ?? brief.agent?.id}
        briefId={brief.id}
        briefType={brief.type}
        resolvedAction={brief.resolvedAction}
        taskId={brief.taskId}
        taskStatus={brief.taskStatus}
        topicId={brief.topicId}
        topicTitle={brief.taskName}
      />
    </>
  );

  if (bare) return <div className="flex flex-col gap-2.5">{content}</div>;

  return (
    <div
      className={cx(briefStyles.card, 'flex flex-col gap-2.5 p-3 border')}
      style={{
        borderColor: cssVar.colorBorderSecondary,
        background: cssVar.colorBgContainer,
        borderRadius: cssVar.borderRadiusLG,
      }}
    >
      {content}
    </div>
  );
});

export default InboxBriefCard;
