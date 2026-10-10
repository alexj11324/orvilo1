import { cn } from 'cn';
import { ChevronDown, ChevronUp, CircleArrowRight } from 'lucide-react';
import {
  createElement,
  type KeyboardEvent,
  memo,
  useCallback,
  useId,
  useMemo,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { Checkbox } from '@/components/ui/checkbox';
import { useChatStore } from '@/store/chat';
import { selectCurrentTurnTodosFromMessages } from '@/store/chat/slices/message/selectors/dbMessage';
import { messageMapKey } from '@/store/chat/utils/messageMapKey';

import { useAgentContext } from '../../useAgentContext';
import { normalizeTaskProgress } from './taskProgressAdapter';

const RING_SIZE = 14;
const RING_STROKE = 2;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUM = 2 * Math.PI * RING_RADIUS;

const styles = {
  collapsed: 'grid-rows-[0fr] mt-0 py-0 opacity-0',
  count:
    'shrink-0 px-1.5 rounded-(--radius-chip) font-mono text-xs leading-5 text-muted-foreground bg-selected',
  expanded: 'grid-rows-[1fr] opacity-100',
  header: 'text-xs leading-5 font-semibold text-muted-foreground uppercase tracking-normal',
  headerRow:
    'cursor-pointer select-none min-h-8 pt-1 pb-1.5 px-2.5 rounded-(--radius-button) transition-colors duration-(--orvilo-motion-fast) hover:bg-accent focus-visible:outline-2 focus-visible:outline-primary focus-visible:outline-offset-2',
  itemRow: 'py-1.5 px-1 border-b border-dashed border-divider text-sm leading-5.5 last:border-b-0',
  listContainer:
    'grid py-1 px-2.5 transition-[grid-template-rows,opacity,padding] duration-(--orvilo-motion-fast) ease-in-out',
  listInner: 'overflow-hidden flex flex-col min-h-0',
  processingRow: 'flex gap-1.5 items-center',
  ring: '-rotate-90 shrink-0',
  ringProgress: 'transition-[stroke-dashoffset,stroke] duration-(--orvilo-motion-fast) ease-in-out',
  ringTrack: 'stroke-selected',
  textCompleted: 'text-foreground-quaternary line-through',
  textProcessing: 'text-foreground',
  textTodo: 'text-muted-foreground',
};

const ProgressSection = memo<{ className?: string }>(({ className }) => {
  const { t } = useTranslation('chat');
  const [expanded, setExpanded] = useState(true);
  const context = useAgentContext();
  const chatKey = messageMapKey(context);
  const dbMessages = useChatStore((s) => s.dbMessagesMap[chatKey]);
  const listId = useId();

  const progress = useMemo(
    () => normalizeTaskProgress(selectCurrentTurnTodosFromMessages(dbMessages || [])),
    [dbMessages],
  );

  const items = progress.items;
  const total = items.length;
  const completed = items.filter((item) => item.status === 'completed').length;

  const toggleExpanded = useCallback(() => setExpanded((prev) => !prev), []);
  const handleHeaderKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        toggleExpanded();
      }
    },
    [toggleExpanded],
  );

  if (total === 0) return null;

  const allDone = completed === total;
  const ringOffset = RING_CIRCUM * (1 - progress.completionPercent / 100);

  return (
    <div className={className} data-testid="workspace-progress">
      <div
        aria-controls={listId}
        aria-expanded={expanded}
        className={cn('flex items-center gap-2 justify-between', styles.headerRow)}
        role="button"
        tabIndex={0}
        onClick={toggleExpanded}
        onKeyDown={handleHeaderKeyDown}
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <svg className={styles.ring} height={RING_SIZE} width={RING_SIZE}>
            <circle
              className={styles.ringTrack}
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              fill="none"
              r={RING_RADIUS}
              strokeWidth={RING_STROKE}
            />
            <circle
              className={cn(styles.ringProgress, allDone ? 'stroke-success' : 'stroke-info')}
              cx={RING_SIZE / 2}
              cy={RING_SIZE / 2}
              fill="none"
              r={RING_RADIUS}
              strokeDasharray={RING_CIRCUM}
              strokeDashoffset={ringOffset}
              strokeLinecap="round"
              strokeWidth={RING_STROKE}
            />
          </svg>
          <span className={styles.header}>{t('workingPanel.progress')}</span>
          <span className={styles.count}>
            {completed}/{total}
          </span>
        </div>
        {createElement(expanded ? ChevronUp : ChevronDown, {
          size: 14,
          className: 'shrink-0 text-foreground-tertiary',
        })}
      </div>

      <div
        className={cn(styles.listContainer, expanded ? styles.expanded : styles.collapsed)}
        id={listId}
      >
        <div className={styles.listInner}>
          {items.map((item, index) => {
            const isCompleted = item.status === 'completed';
            const isProcessing = item.status === 'processing';

            if (isProcessing) {
              return (
                <div className={cn(styles.itemRow, styles.processingRow)} key={item.id ?? index}>
                  <CircleArrowRight className="text-muted-foreground" size={17} />
                  <span className={styles.textProcessing}>{item.text}</span>
                </div>
              );
            }

            return (
              <label className={styles.itemRow} key={item.id ?? index}>
                <Checkbox
                  checked={isCompleted}
                  className="pointer-events-none cursor-default rounded-full data-checked:border-success data-checked:bg-success data-checked:text-success-on-fill dark:data-checked:bg-success"
                />
                <span className={cn(styles.textTodo, isCompleted && styles.textCompleted)}>
                  {item.text}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
});

ProgressSection.displayName = 'ProgressSection';

export default ProgressSection;
