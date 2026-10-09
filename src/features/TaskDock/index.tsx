import { createStaticStyles, cssVar } from 'antd-style';
import { cn } from 'cn';
import {
  CheckIcon,
  ChevronDownIcon,
  CircleSlashIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import * as m from 'motion/react-m';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import ActionIcon from '@/components/ActionIcon';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import Item from './Item';
import {
  groupDockTasks,
  hasCancellableTask,
  isActiveTask,
  resolveDockOverview,
  shouldAutoDismiss,
} from './presentation';
import type { DockTask } from './type';
import { useDockTasks } from './useDockTasks';

/** How long a resultless success stays readable before it clears itself. */
const AUTO_DISMISS_DELAY = 3000;
/** Lets a burst of dismissals finish before the dock changes shape. */
const SHAPE_SETTLE_DELAY = 400;

const styles = createStaticStyles(({ css }) => ({
  container: css`
    position: fixed;
    z-index: 100;
    inset-block-end: 24px;
    inset-inline-end: 24px;

    overflow: hidden;

    width: 340px;
    border: 1px solid ${cssVar.colorBorderSecondary};
    border-radius: 12px;

    background: ${cssVar.colorBgContainer};
    box-shadow: ${cssVar.boxShadowSecondary};
  `,
  groupHead: css`
    border-block-end: 1px solid ${cssVar.colorFillQuaternary};

    font-family: ${cssVar.fontFamilyCode};
    font-size: 11px;
    color: ${cssVar.colorTextDescription};
    text-transform: uppercase;
    letter-spacing: 0.08em;

    background: ${cssVar.colorFillQuaternary};
  `,
  head: css`
    cursor: pointer;
    padding-block: 9px;
    padding-inline: 12px;
  `,
  headDivider: css`
    border-block-end: 1px solid ${cssVar.colorBorderSecondary};
  `,
  list: css`
    overflow-y: auto;
    max-height: 340px;
  `,
  row: css`
    &:not(:first-child) {
      border-block-start: 1px solid ${cssVar.colorFillQuaternary};
    }
  `,
}));

const useSettledShape = (count: number): 'solo' | 'panel' => {
  const [shape, setShape] = useState<'solo' | 'panel'>(count > 1 ? 'panel' : 'solo');

  useEffect(() => {
    const next = count > 1 ? 'panel' : 'solo';
    if (next === shape) return;
    // Growing is unambiguous; shrinking waits, so a burst of dismissals does
    // not morph the dock once per task on its way down to one.
    if (next === 'panel') {
      setShape('panel');
      return;
    }

    const timer = setTimeout(() => setShape('solo'), SHAPE_SETTLE_DELAY);

    return () => clearTimeout(timer);
  }, [count, shape]);

  return shape;
};

const useAutoDismiss = (tasks: DockTask[]) => {
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;

  const dismissable = tasks.filter((task) => shouldAutoDismiss(task) && !!task.dismiss);
  const ids = dismissable.map((task) => task.id).join('|');

  useEffect(() => {
    if (!ids) return;

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const id of ids.split('|')) {
      const timer = setTimeout(() => {
        const task = tasksRef.current.find((candidate) => candidate.id === id);
        if (task && shouldAutoDismiss(task)) task.dismiss?.();
      }, AUTO_DISMISS_DELAY);
      timers.push(timer);
    }

    return () => {
      for (const timer of timers) clearTimeout(timer);
    };
  }, [ids]);
};

/**
 * App-level dock for background work. Producers contribute tasks through
 * `useDockTasks`; the dock owns the shape, the aggregate header and dismissal.
 */
const TaskDock = memo(() => {
  const { t } = useTranslation('common');
  const [expand, setExpand] = useState(true);

  const tasks = useDockTasks();
  const shape = useSettledShape(tasks.length);
  useAutoDismiss(tasks);

  const { activeCount, status } = useMemo(() => resolveDockOverview(tasks), [tasks]);
  const groups = useMemo(() => groupDockTasks(tasks), [tasks]);
  const isRunning = status === 'running';
  const canCancel = useMemo(() => hasCancellableTask(tasks), [tasks]);

  const dismissAll = useCallback(() => {
    tasks.forEach((task) => task.dismiss?.());
  }, [tasks]);

  const cancelAll = useCallback(() => {
    const batched = new Set<string>();

    for (const task of tasks) {
      if (!task.groupCancel) {
        task.cancel?.();
        continue;
      }
      if (batched.has(task.groupLabel)) continue;
      batched.add(task.groupLabel);
      task.groupCancel();
    }
  }, [tasks]);

  const icon = useMemo(() => {
    switch (status) {
      case 'success': {
        return <CheckIcon color={cssVar.colorSuccess} size={16} />;
      }
      case 'error': {
        return <TriangleAlertIcon color={cssVar.colorError} size={16} />;
      }
      case 'cancelled': {
        return <CircleSlashIcon color={cssVar.colorTextDescription} size={16} />;
      }
      default: {
        return <LoaderCircleIcon className="animate-spin" size={16} />;
      }
    }
  }, [status]);

  if (tasks.length === 0) return null;

  // One task speaks for itself: no header, no group gutter, just the row and
  // whatever it left behind.
  if (shape === 'solo') {
    return (
      <div className={`flex flex-col ${styles.container}`}>
        <Item {...tasks[0]} solo />
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${styles.container}`}>
      <div
        {...clickableProps()}
        className={cn(
          `flex items-center gap-2.5 ${styles.head} ${expand ? styles.headDivider : ''}`,
          CLICKABLE_FOCUS_RING,
        )}
        onClick={() => setExpand(!expand)}
      >
        {icon}
        <div className="flex flex-1 items-baseline gap-[7px]" style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14 }}>{t(`taskDock.status.${status}`)}</div>
          <div className="truncate min-w-0 text-muted-foreground" style={{ fontSize: 12 }}>
            {activeCount > 0
              ? t('taskDock.activeOf', { active: activeCount, total: tasks.length })
              : t('taskDock.totalCount', { count: tasks.length })}
          </div>
        </div>
        <div
          className="flex items-center gap-1"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          {canCancel && (
            <div
              {...clickableProps()}
              className={cn('text-muted-foreground', CLICKABLE_FOCUS_RING)}
              style={{ cursor: 'pointer', flexShrink: 0, fontSize: 12 }}
              onClick={cancelAll}
            >
              {t('taskDock.cancelAll')}
            </div>
          )}
          {isRunning ? (
            <ActionIcon
              icon={ChevronDownIcon}
              size={'small'}
              style={{ transform: expand ? undefined : 'rotate(180deg)' }}
              title={t(expand ? 'taskDock.collapse' : 'taskDock.expand')}
              onClick={() => setExpand(!expand)}
            />
          ) : (
            <ActionIcon icon={XIcon} size={'small'} title={t('close')} onClick={dismissAll} />
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expand && (
          <m.div
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            <div className={`flex flex-col ${styles.list}`}>
              {groups.map((group) => (
                <div className="flex flex-col" key={group.label}>
                  <div
                    className={`flex items-center justify-between py-[5px] ${styles.groupHead}`}
                    // The count aligns with the rows' action glyphs, which sit
                    // 5px inside their own hit area — not with the row padding.
                    style={{ paddingInlineEnd: 19, paddingInlineStart: 12 }}
                  >
                    <span>{group.label}</span>
                    <span>
                      {group.tasks.some(isActiveTask)
                        ? `${group.tasks.filter(isActiveTask).length} / ${group.tasks.length}`
                        : group.tasks.length}
                    </span>
                  </div>
                  {group.tasks.map((task) => (
                    <div className={`flex flex-col ${styles.row}`} key={task.id}>
                      <Item {...task} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
});

TaskDock.displayName = 'TaskDock';

export default TaskDock;
