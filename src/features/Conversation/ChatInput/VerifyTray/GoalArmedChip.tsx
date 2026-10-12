'use client';

import { clsx as cx, cn } from 'cn';
import { TargetIcon, XIcon } from 'lucide-react';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import { useConversationStore } from '../../store';
import { useGoalArmStore } from './goalArmStore';

const styles = {
  chip: 'cursor-pointer inline-flex gap-1 items-center px-2 rounded-(--radius-button) text-sm text-foreground-tertiary transition-[color,background-color] duration-(--orvilo-motion-mid) ease-[ease] hover:text-foreground hover:bg-accent [&:hover_.goal-armed-target]:opacity-0 [&:hover_.goal-armed-close]:opacity-100',
  iconClose:
    'absolute inset-0 opacity-0 transition-opacity duration-(--orvilo-motion-mid) ease-[ease]',
  iconSlot: 'relative inline-flex flex-none size-4',
  iconTarget: 'transition-opacity duration-(--orvilo-motion-mid) ease-[ease]',
};

/**
 * Pre-topic "armed goal" indicator — a Codex-style chip that sits inline in the
 * composer action bar (next to `+`) once a goal has been armed from the `+`
 * menu but no topic exists yet, i.e. the next message the user sends becomes the
 * goal. Clicking it cancels the arm.
 *
 * It is only ever the pre-topic armed state: the moment a topic exists the goal
 * earns its persistent home in the tray above the composer, so this chip hides.
 * Self-gating (returns null unless armed) so it can be appended unconditionally
 * to the action bar of every composer that renders the shared ChatInput.
 *
 * On hover the leading target icon crossfades into an ✕ so the "click to cancel"
 * affordance is discoverable rather than hidden behind the tooltip alone.
 */
const GoalArmedChip = memo(() => {
  const { t } = useTranslation('verify');
  const agentId = useConversationStore((s) => s.context.agentId);
  const topicId = useConversationStore((s) => s.context.topicId);
  const armedAt = useGoalArmStore((s) => (agentId ? s.armedAt[agentId] : undefined));
  const disarm = useGoalArmStore((s) => s.disarm);

  if (!agentId || topicId || armedAt === undefined) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={
            <span className="inline-flex">
              <Button
                {...clickableProps()}
                className={cn(styles.chip, CLICKABLE_FOCUS_RING)}
                size="compact"
                type="button"
                variant="ghost"
                onClick={() => disarm(agentId)}
              >
                <span className={styles.iconSlot}>
                  <TargetIcon className={cx('goal-armed-target', styles.iconTarget)} size={16} />
                  <XIcon className={cx('goal-armed-close', styles.iconClose)} size={16} />
                </span>
                <span>{t('acceptance.tray.goalLabel')}</span>
              </Button>
            </span>
          }
        />
        <TooltipContent>{t('acceptance.tray.goalDisarm')}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

GoalArmedChip.displayName = 'GoalArmedChip';

export default GoalArmedChip;
