'use client';

import { cn } from 'cn';
import { PencilIcon, PlusIcon } from 'lucide-react';
import { memo, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanFooter,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from '@/components/ai-elements/plan';
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
    <Plan
      className={cn('rounded-b-none', topAttached && 'rounded-t-none')}
      open={open}
      onOpenChange={setOpen}
    >
      <PlanHeader>
        <div className="min-w-0 space-y-1">
          <PlanTitle>{t('acceptance.tray.goalLabel')}</PlanTitle>
          <PlanDescription>{goal}</PlanDescription>
        </div>
        <PlanAction className="flex shrink-0 items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    aria-label={t('acceptance.tray.goalModal.editTitle')}
                    size="icon-sm"
                    variant="ghost"
                    onClick={openEditGoal}
                  >
                    <PencilIcon />
                  </Button>
                }
              />
              <TooltipContent>{t('acceptance.tray.goalModal.editTitle')}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <PlanTrigger />
        </PlanAction>
      </PlanHeader>
      <PlanContent className="space-y-4">
        {checks.length > 0 && (
          <p className="text-sm text-muted-foreground">
            {t('acceptance.tray.trackCount', { count: checks.length })}
          </p>
        )}
        {checks.map((check) => (
          <CheckItem
            check={check}
            key={check.id}
            onRemove={() => removeCheck(check.id)}
            onUpdate={(patch) => updateCheck(check.id, patch)}
          />
        ))}
      </PlanContent>
      {open && (
        <PlanFooter>
          <Button size="sm" variant="ghost" onClick={openAddCheck}>
            <PlusIcon data-icon="inline-start" />
            {t('acceptance.tray.addCheck')}
          </Button>
        </PlanFooter>
      )}
    </Plan>
  );
});
GoalTray.displayName = 'GoalTray';
export default GoalTray;
