'use client';

import { createStaticStyles, cssVar, cx } from 'antd-style';
import { cn } from 'cn';
import { ChevronDown, ChevronRight, PencilIcon, PlusIcon, TargetIcon } from 'lucide-react';
import { createElement, memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useUserStore } from '@/store/user';
import { labPreferSelectors } from '@/store/user/selectors';

import { useConversationStore } from '../../store';
import { pickArmedMessage } from './armedMessage';
import CheckItem from './CheckItem';
import { openCheckEditModal } from './EditModal';
import { useGoalArmStore } from './goalArmStore';
import { openGoalModal } from './GoalModal';
import { useTopicGoal } from './useTopicChecklist';

const styles = createStaticStyles(({ css }) => ({
  addRow: css`
    padding-block: 4px;
    padding-inline: 8px;
  `,
  container: css`
    border: 1px solid ${cssVar.colorFillSecondary};
    border-block-end: none;
    border-start-start-radius: 12px;
    border-start-end-radius: 12px;

    background: ${cssVar.colorBgElevated};
  `,
  containerTopAttached: css`
    border-start-start-radius: 0;
    border-start-end-radius: 0;
  `,
  goalRow: css`
    padding-block: 6px 8px;
    padding-inline: 12px;

    &:hover .verify-tray-goal-edit {
      opacity: 1;
    }
  `,
  goalText: css`
    color: ${cssVar.colorTextSecondary};
  `,
  head: css`
    cursor: pointer;
    user-select: none;
    padding-block: 6px;
    padding-inline: 12px;

    &:hover {
      background: ${cssVar.colorFillQuaternary};
    }
  `,
  rowEdit: css`
    opacity: 0;
    transition: opacity 0.15s;
  `,
  secLabel: css`
    font-size: 10px;
    color: ${cssVar.colorTextQuaternary};
    text-transform: uppercase;
    letter-spacing: 0.04em;
  `,
  summary: css`
    overflow: hidden;

    font-size: 12px;
    color: ${cssVar.colorTextSecondary};
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
}));

interface GoalTrayProps {
  topAttached?: boolean;
}

/**
 * Topic Goal tray, floating just above the composer once a topic exists (behind
 * the `enableTopicAcceptance` lab). Before a topic is created the goal entry
 * lives in the composer "+" menu; the moment the conversation has a topic, the
 * goal earns a persistent home above the input — the "sent" state the user
 * asked for.
 *
 * When the user armed the goal from the "+" menu before sending, the first
 * message they send becomes the goal (the message IS the goal); otherwise the
 * goal is only ever set explicitly via the "+" menu / pencil. Tracking checks
 * live under it.
 */
const GoalTray = memo<GoalTrayProps>(({ topAttached }) => {
  const { t } = useTranslation('verify');
  const enabled = useUserStore(labPreferSelectors.enableTopicAcceptance);
  const topicId = useConversationStore((s) => s.context.topicId);
  const agentId = useConversationStore((s) => s.context.agentId);
  const displayMessages = useConversationStore((s) => s.displayMessages);
  const armedAt = useGoalArmStore((s) => (agentId ? s.armedAt[agentId] : undefined));
  const disarm = useGoalArmStore((s) => s.disarm);
  const { goal, checks, isLoading, setGoal, addCheck, updateCheck, removeCheck } = useTopicGoal(
    topicId ?? undefined,
  );
  const [open, setOpen] = useState(false);

  // The armed goal only applies to the topic it was armed in. Once a topic
  // becomes active while armed, adopt the message the user actually armed — the
  // first user message sent at or after the arm — as the goal. Older messages
  // carried over from the default conversation predate the arm, so they're
  // skipped (which also stops switching into a pre-existing topic from hijacking
  // the arm or clobbering its saved goal). Spend the arm either way, so it never
  // leaks to the next topic.
  useEffect(() => {
    if (!enabled || !agentId || armedAt === undefined || !topicId || isLoading) return;
    if (!goal) {
      const armedMessage = pickArmedMessage(displayMessages, armedAt);
      if (armedMessage?.content) void setGoal(armedMessage.content);
    }
    disarm(agentId);
  }, [enabled, agentId, armedAt, topicId, isLoading, goal, displayMessages, setGoal, disarm]);

  // The pre-topic "armed" state is surfaced as a chip in the composer action bar
  // (see GoalArmedChip), not as a tray here — the tray is only the "goal set"
  // home once a topic exists.
  if (!enabled || !topicId || !goal) return null;

  const openAddCheck = () => openCheckEditModal({ onSubmit: (v) => addCheck(v) });
  const openEditGoal = () =>
    openGoalModal({
      initialGoal: goal,
      // Clearing the goal writes an empty requirement — the tray hides itself
      // once there's no goal (tracking checks are kept, so re-setting a goal
      // brings them back).
      onDelete: () => setGoal(''),
      onSubmit: (v) => setGoal(v),
    });

  return (
    <div
      className={cn(
        'flex flex-col',
        cx(styles.container, topAttached && styles.containerTopAttached),
      )}
    >
      <div
        className={cn('flex items-center gap-2 justify-between', styles.head)}
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center flex-1 gap-2" style={{ minWidth: 0 }}>
          <TargetIcon color={cssVar.colorTextSecondary} size={14} />
          <div className="font-semibold text-[12px]" style={{ flexShrink: 0 }}>
            {t('acceptance.tray.goalLabel')}
          </div>
          {/* The goal sentence rides inline only while collapsed; expanded, the
              "Goal" section below owns it, so showing it here too is redundant. */}
          {!open && <span className={styles.summary}>{goal}</span>}
          {checks.length > 0 && (
            <div className="text-[12px] text-muted-foreground" style={{ flexShrink: 0 }}>
              {t('acceptance.tray.trackCount', { count: checks.length })}
            </div>
          )}
        </div>
        {createElement(open ? ChevronDown : ChevronRight, {
          color: cssVar.colorTextQuaternary,
          size: 14,
        })}
      </div>

      {open && (
        <>
          <div className={cn('flex flex-col gap-1', styles.goalRow)}>
            <div className="flex items-center gap-2 justify-between">
              <div className={styles.secLabel}>{t('acceptance.tray.goalSection')}</div>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span style={{ display: 'inline-flex' }}>
                        <ActionIcon
                          className={cx('verify-tray-goal-edit', styles.rowEdit)}
                          icon={PencilIcon}
                          size={'small'}
                          onClick={openEditGoal}
                        />
                      </span>
                    }
                  />
                  <TooltipContent>{t('acceptance.tray.goalModal.editTitle')}</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <div className="text-[13px] styles.goalText">{goal}</div>
          </div>

          {checks.length > 0 && (
            <div
              className={cn('flex flex-col gap-0.5', styles.goalRow)}
              style={{ paddingBlock: 0 }}
            >
              <div className={styles.secLabel}>{t('acceptance.tray.trackSection')}</div>
            </div>
          )}
          {checks.map((check) => (
            <CheckItem
              check={check}
              key={check.id}
              onRemove={() => removeCheck(check.id)}
              onUpdate={(patch) => updateCheck(check.id, patch)}
            />
          ))}
          <div className={cn('flex', styles.addRow)}>
            <Button size="sm" variant="ghost" onClick={openAddCheck}>
              <PlusIcon data-icon="inline-start" /> {t('acceptance.tray.addCheck')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
});

GoalTray.displayName = 'GoalTray';

export default GoalTray;
