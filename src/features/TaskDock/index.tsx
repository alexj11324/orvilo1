import { cn } from 'cn';
import {
  CheckIcon,
  ChevronDownIcon,
  CircleSlashIcon,
  LoaderCircleIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import { AnimatePresence, useAnimationControls, usePresence } from 'motion/react';
import * as m from 'motion/react-m';
import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from 'react-responsive';

import ActionIcon from '@/components/ActionIcon';
import { Button } from '@/components/ui/button';
import { useUserStore } from '@/store/user';
import { userGeneralSettingsSelectors } from '@/store/user/selectors';
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

const styles = {
  container:
    'fixed z-100 inset-be-6 inset-e-6 flex flex-col w-85 overflow-hidden rounded-(--radius-overlay) border border-divider bg-card text-sm leading-5.5 text-foreground shadow-(--shadow-popover)',
  groupHead:
    'border-be border-divider bg-fill-quaternary font-mono text-xs leading-5 text-foreground-description uppercase tracking-[0.08em]',
  head: 'cursor-pointer px-4 py-2',
  headDivider: 'border-be border-divider',
  list: 'max-h-85 overflow-y-auto',
  row: 'not-first:border-bs not-first:border-divider',
};

// Presence retains exiting children. Keep the real live subscriptions in the
// frame so disabling motion also settles an exit already in progress.
const TaskDockMotionContent = ({ children }: { children: ReactNode }) => {
  const animationMode = useUserStore(userGeneralSettingsSelectors.animationMode);
  const reducedMotion = useMediaQuery({ query: '(prefers-reduced-motion: reduce)' });
  const disableMotion = animationMode === 'disabled' || reducedMotion;
  const controls = useAnimationControls();
  const [isPresent, safeToRemove] = usePresence();

  useLayoutEffect(() => {
    let active = true;
    controls.stop();
    if (disableMotion) {
      controls.set({ height: 'auto', opacity: 1 });
    } else {
      void controls
        .start(
          { height: isPresent ? 'auto' : 0, opacity: isPresent ? 1 : 0 },
          { duration: animationMode === 'agile' ? 0.1 : 0.2, ease: 'easeInOut' },
        )
        .then(() => {
          if (active && !isPresent) safeToRemove?.();
        });
    }
    return () => {
      active = false;
      controls.stop();
    };
  }, [animationMode, controls, disableMotion, isPresent, safeToRemove]);

  // Notify after AnimatePresence's parent layout-effect registration exists.
  useEffect(() => {
    if (disableMotion && !isPresent) safeToRemove?.();
  }, [disableMotion, isPresent, safeToRemove]);

  return (
    <m.div
      animate={controls}
      className="overflow-hidden"
      initial={disableMotion ? false : { height: 0, opacity: 0 }}
    >
      {children}
    </m.div>
  );
};

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
        return <CheckIcon className="text-success-text" size={16} />;
      }
      case 'error': {
        return <TriangleAlertIcon className="text-destructive-text" size={16} />;
      }
      case 'cancelled': {
        return <CircleSlashIcon className="text-foreground-description" size={16} />;
      }
      default: {
        return <LoaderCircleIcon className="motion-safe:animate-spin" size={16} />;
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
        <div className="flex min-w-0 flex-1 items-baseline gap-1.75">
          <div className="text-sm leading-5.5">{t(`taskDock.status.${status}`)}</div>
          <div className="truncate min-w-0 text-xs leading-5 text-muted-foreground">
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
            <Button
              className="text-muted-foreground"
              size="compact"
              variant="ghost"
              onClick={cancelAll}
            >
              {t('taskDock.cancelAll')}
            </Button>
          )}
          {isRunning ? (
            <ActionIcon
              icon={ChevronDownIcon}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              style={{ transform: expand ? undefined : 'rotate(180deg)' }}
              title={t(expand ? 'taskDock.collapse' : 'taskDock.expand')}
              onClick={() => setExpand(!expand)}
            />
          ) : (
            <ActionIcon
              icon={XIcon}
              size={{ blockSize: 32, borderRadius: 'var(--radius-button)', size: 16 }}
              title={t('close')}
              onClick={dismissAll}
            />
          )}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expand && (
          <TaskDockMotionContent>
            <div className={`flex flex-col ${styles.list}`}>
              {groups.map((group) => (
                <div className="flex flex-col" key={group.label}>
                  <div
                    className={`flex items-center justify-between py-1.5 ps-4 pe-6 ${styles.groupHead}`}
                    // The 32px action target places its 16px glyph 8px inside
                    // the row's 16px end gutter; the group count shares that edge.
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
          </TaskDockMotionContent>
        )}
      </AnimatePresence>
    </div>
  );
});

TaskDock.displayName = 'TaskDock';

export default TaskDock;
