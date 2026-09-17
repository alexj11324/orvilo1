'use client';

import { Flexbox, Icon } from '@lobehub/ui';
import { createStaticStyles, cssVar } from 'antd-style';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { memo, useMemo, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import Avatar from '@/components/Avatar';
import {
  liveActivities,
  MAX_EXPANDED_BUBBLES,
  type ServerActivityEvent,
  useCollaborationStore,
} from '@/store/collaboration';

import { AGENT_PHASE_ICON } from './AgentActionCursor';
import { collabIdForTarget } from './anchors';
import { useCollaborationContext } from './context';

const styles = createStaticStyles(({ css }) => ({
  dock: css`
    position: absolute;
    inset-block-end: 16px;
    inset-inline-end: 16px;

    display: flex;
    flex-direction: column;
    gap: 6px;

    max-width: 260px;
  `,
  item: css`
    pointer-events: none;

    display: flex;
    gap: 6px;
    align-items: center;

    padding-block: 5px;
    padding-inline: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 8px;

    font-size: 12px;
    color: ${cssVar.colorText};

    background: ${cssVar.colorBgElevated};
    box-shadow: ${cssVar.boxShadowSecondary};
  `,
  itemText: css`
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  `,
  phaseIcon: css`
    flex-shrink: 0;
  `,
  toggle: css`
    pointer-events: auto;
    cursor: pointer;
    user-select: none;

    display: flex;
    gap: 4px;
    align-items: center;
    align-self: flex-end;

    padding-block: 4px;
    padding-inline: 8px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 999px;

    font-size: 11px;
    color: ${cssVar.colorTextSecondary};

    background: ${cssVar.colorBgElevated};

    &:hover {
      color: ${cssVar.colorText};
      background: ${cssVar.colorFillSecondary};
    }
  `,
}));

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
            <Icon className={styles.phaseIcon} icon={PhaseIcon} size={12} />
          </div>
        );
      })}
      <Flexbox horizontal justify="flex-end">
        <button className={styles.toggle} type="button" onClick={() => setExpanded((v) => !v)}>
          {expanded ? (
            <>
              <Icon icon={ChevronUp} size={12} />
              {t('teammates.activity.collapse')}
            </>
          ) : (
            <>
              <Icon icon={ChevronDown} size={12} />
              {moreCount > 0
                ? t('teammates.activity.more', { count: moreCount })
                : t('teammates.activity.expand')}
            </>
          )}
        </button>
      </Flexbox>
    </div>
  );
});

ActivityDock.displayName = 'ActivityDock';
