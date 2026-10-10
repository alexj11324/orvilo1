'use client';

import { cn } from 'cn';
import { memo, useEffect, useRef } from 'react';

import { devDockPanelStyles } from '@/features/DevDock/panelStyles';
import { CLICKABLE_FOCUS_RING, clickableProps } from '@/utils/clickableProps';

import type { ApiEntry } from './useDevtoolsEntries';

const styles = {
  column: 'flex flex-col shrink-0 w-60 h-full border-e border-divider bg-card',
  dot: 'shrink-0 size-1.5 rounded-full bg-foreground-quaternary',
  dotActive: 'bg-primary',
  item: 'cursor-pointer overflow-hidden shrink-0 gap-2 items-center h-8 px-3 text-muted-foreground transition-colors duration-(--orvilo-motion-fast) hover:text-foreground hover:bg-fill-quaternary',
  itemActive: 'text-foreground bg-selected hover:bg-selected',
  // Elide the namespace prefix while keeping the distinguishing action visible.
  labelHead:
    'overflow-hidden flex-[0_1_auto] text-foreground-quaternary text-ellipsis whitespace-nowrap',
  labelRow: 'overflow-hidden flex flex-1 items-baseline min-w-0 font-mono text-sm leading-5.5',
  labelTail: 'shrink-0 whitespace-nowrap',
  list: 'overflow-auto flex-1 gap-0.5 min-h-0 py-1',
};

/**
 * Split a name at its last `__` so the long `mcp__<server>__` namespace can
 * elide from the middle (`mcp__claude_ai_Li…get_diff`) — keeping both the
 * `mcp` signal up front and the distinguishing action at the end, instead of
 * truncating one or the other away. Non-namespaced names are all tail.
 */
const splitName = (name: string): { head: string; tail: string } => {
  const cut = name.lastIndexOf('__');
  if (cut === -1) return { head: '', tail: name };
  return { head: name.slice(0, cut + 2), tail: name.slice(cut + 2) };
};

interface ApiListProps {
  activeApiName?: string;
  apis: ApiEntry[];
  onSelect: (apiName: string) => void;
}

/**
 * Middle column for the render gallery: a dense jump-list of the current
 * toolset's APIs. Clicking scrolls the matching `ToolPreview` card into view
 * and pins a URL hash (`#api-<name>`) so a specific render is deep-linkable;
 * the active item is driven by the scrollspy in `ToolPage`. The leading dot
 * lights up when the API ships a Render.
 */
const ApiList = memo<ApiListProps>(({ apis, activeApiName, onSelect }) => {
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the highlighted item visible as the scrollspy walks down the right
  // pane — otherwise the list stays pinned at the top and you lose your place.
  useEffect(() => {
    if (!activeApiName) return;
    const el = listRef.current?.querySelector(`[data-api="${CSS.escape(activeApiName)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeApiName]);

  return (
    <aside className={styles.column}>
      <div className={devDockPanelStyles.paneHeader}>
        <div className="text-xs leading-5 text-muted-foreground font-semibold">
          APIs · {apis.length}
        </div>
      </div>
      <div className={cn(styles.list, 'flex flex-col')} ref={listRef}>
        {apis.map((api) => {
          const active = api.apiName === activeApiName;
          const { head, tail } = splitName(api.apiName);
          return (
            <div
              {...clickableProps()}
              data-api={api.apiName}
              key={api.apiName}
              title={api.apiName}
              className={cn(
                cn(cn(styles.item, active && styles.itemActive), 'flex'),
                CLICKABLE_FOCUS_RING,
              )}
              onClick={() => onSelect(api.apiName)}
            >
              <span className={cn(styles.dot, api.render && styles.dotActive)} />
              <span className={styles.labelRow}>
                {head && <span className={styles.labelHead}>{head}</span>}
                <span className={styles.labelTail}>{tail}</span>
              </span>
            </div>
          );
        })}
      </div>
    </aside>
  );
});

ApiList.displayName = 'DevtoolsApiList';

export default ApiList;
