'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { memo, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import { Button } from '@/components/ui/button';
import {
  liveActivities,
  MAX_EXPANDED_BUBBLES,
  type ServerActivityEvent,
  useCollaborationStore,
} from '@/store/collaboration';

import { AGENT_PHASE_ICON } from './AgentActionCursor';
import { collabIdForTarget } from './anchors';
import { useCollaborationContext } from './context';

const styles = {
  dock: 'absolute inset-be-4 inset-e-4 flex flex-col gap-1.5 max-w-65',
  item: 'pointer-events-none flex gap-1.5 items-center py-1 px-2 border border-divider rounded-(--radius-card) text-xs leading-5 text-foreground bg-popover shadow-(--shadow-popover)',
  itemText: 'truncate',
  phaseIcon: 'shrink-0',
  toggle:
    'pointer-events-auto self-end rounded-full px-2 text-sm leading-5.5 text-muted-foreground bg-popover border-divider hover:text-foreground hover:bg-accent',
};

/**
 * Live activities that resolved on-screen already have bubbles/pulses — the
 * dock only carries what the board can't show: activities whose targets are
 * off-screen or filtered out, plus anything past the expanded cap. The dock
 * is informational (pointer-events none on items, toggle is the only
 * interactive part); clicking a row doesn't act on the task.
 */
export const ActivityDock = memo(() => {
  const { t } = useTranslation('common');
  const ctx = useCollaborationContext();
  const [expanded, setExpanded] = useState(false);

  const activities = useCollaborationStore((s) =>
    ctx ? s.rooms[ctx.roomKey]?.activities : undefined,
  );
  useSyncExternalStore(
    ctx ? ctx.registry.subscribe : () => () => {},
    ctx ? ctx.registry.getVersion : () => 0,
  );

  const offscreen = useMemo(() => {
    if (!ctx) return [];
    const events = liveActivities(
      { activities: activities ?? {}, presence: {}, status: 'online' },
      Date.now(),
    );
    // First MAX_EXPANDED_BUBBLES resolvable events get bubbles on the board;
    // the dock shows the resolvable overflow + everything unresolvable.
    const resolvable: ServerActivityEvent[] = [];
    const hidden: ServerActivityEvent[] = [];
    for (const event of events) {
      if (ctx.registry.has(collabIdForTarget(event.target))) {
        resolvable.push(event);
      } else {
        hidden.push(event);
      }
    }
    return [...resolvable.slice(MAX_EXPANDED_BUBBLES), ...hidden];
  }, [ctx, activities]);

  if (!ctx || offscreen.length === 0) return null;

  const shown = expanded ? offscreen : offscreen.slice(0, 3);
  const moreCount = offscreen.length - shown.length;

  return (
    <div className={styles.dock}>
      {shown.map((event) => {
        const PhaseIcon = AGENT_PHASE_ICON[event.phase];
        const name = event.actor.name || event.actor.id;
        return (
          <div className={styles.item} key={event.eventId}>
            <Avatar avatar={event.actor.avatar} name={name} size={18} title={name} />
            <span className={styles.itemText}>
              {t('teammates.activity.bubble', { action: event.action, name })}
            </span>
            <PhaseIcon className={styles.phaseIcon} size={16} />
          </div>
        );
      })}
      <div className="flex justify-end">
        <Button
          className={styles.toggle}
          size="normal"
          type="button"
          variant="outline"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? (
            <>
              <ChevronUp className="size-4" size={16} />
              {t('teammates.activity.collapse')}
            </>
          ) : (
            <>
              <ChevronDown className="size-4" size={16} />
              {moreCount > 0
                ? t('teammates.activity.more', { count: moreCount })
                : t('teammates.activity.expand')}
            </>
          )}
        </Button>
      </div>
    </div>
  );
});

ActivityDock.displayName = 'ActivityDock';
