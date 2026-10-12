'use client';

import { cn } from 'cn';
import { ChevronDown, Wrench } from 'lucide-react';
import { Fragment, memo } from 'react';

import OverflowMenu from './OverflowMenu';
import { PinnedAction, PinnedSelect, PinnedToggle, WidgetSlot } from './pinnedItems';
import {
  type DevDockItem,
  type DevDockPanelItem,
  selectBarLayout,
  useDevDockItems,
} from './registry';
import { useDevDockStore } from './store';

const styles = {
  // Matches BAR_HEIGHT32 and BAR_OVERLAP8 in the dock geometry owner.
  bar: 'shrink-0 w-full h-8 -mbs-2 px-2 text-xs leading-5 text-muted-foreground whitespace-nowrap',
  center: 'flex flex-1 items-center min-w-0',
  divider: 'shrink-0 w-px h-3 bg-divider',
  iconButton:
    'cursor-pointer inline-flex shrink-0 items-center justify-center size-8 border-0 rounded-(--radius-button) text-foreground-tertiary bg-transparent hover:text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
  // Shares DOCK_Z_INDEX1100 with the memory popup stack.
  pill: 'cursor-pointer fixed z-1100 inset-be-0 start-4 inline-flex gap-1 items-center h-8 px-2 border-0 rounded-ss-(--radius-button) rounded-se-(--radius-button) text-sm leading-5.5 text-card bg-foreground hover:opacity-85 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
  tab: 'cursor-pointer inline-flex shrink-0 gap-1 items-center h-8 px-1.5 border-0 rounded-(--radius-button) text-sm leading-5.5 text-muted-foreground whitespace-nowrap bg-transparent hover:text-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
  tabActive: 'text-foreground bg-selected',
};

const PanelTab = memo<{ item: DevDockPanelItem }>(({ item }) => {
  const active = useDevDockStore((s) => s.activePanelId === item.id);
  const togglePanel = useDevDockStore((s) => s.togglePanel);
  const Icon = item.icon;
  const Badge = item.badge;
  return (
    <button
      className={cn(styles.tab, active && styles.tabActive)}
      type={'button'}
      onClick={() => togglePanel(item.id)}
    >
      <Icon size={16} />
      <span>{item.label}</span>
      {Badge && <Badge />}
    </button>
  );
});

PanelTab.displayName = 'DevDockPanelTab';

const PinnedItem = memo<{ item: Exclude<DevDockItem, DevDockPanelItem> }>(({ item }) => {
  switch (item.type) {
    case 'action': {
      return <PinnedAction item={item} />;
    }
    case 'readout': {
      return <WidgetSlot item={item} />;
    }
    case 'select': {
      return <PinnedSelect item={item} />;
    }
    case 'toggle': {
      return <PinnedToggle item={item} />;
    }
  }
});

PinnedItem.displayName = 'DevDockPinnedItem';

const Bar = memo(() => {
  const expanded = useDevDockStore((s) => s.expanded);
  const setExpanded = useDevDockStore((s) => s.setExpanded);
  const activePanelId = useDevDockStore((s) => s.activePanelId);
  const pinOverrides = useDevDockStore((s) => s.pinOverrides);
  const items = useDevDockItems();

  if (!expanded)
    return (
      <button
        className={styles.pill}
        title={'Open DevDock'}
        type={'button'}
        onClick={() => setExpanded(true)}
      >
        <Wrench size={16} />
        <span>dev</span>
      </button>
    );

  const { center, right, tabs } = selectBarLayout(items, pinOverrides, activePanelId);

  return (
    <div className={cn(styles.bar, 'flex items-center gap-1')}>
      <button
        className={styles.iconButton}
        title={'Collapse DevDock'}
        type={'button'}
        onClick={() => setExpanded(false)}
      >
        <ChevronDown size={16} />
      </button>
      {/* Tabs don't shrink below their label width — clip the row on narrow
          viewports instead of letting it push the page into horizontal scroll. */}
      <div className="flex items-center gap-0.5 min-w-0 overflow-hidden">
        {tabs.map((item) => (
          <PanelTab item={item} key={item.id} />
        ))}
      </div>
      {center ? (
        <div className={styles.center}>
          <WidgetSlot item={center} />
        </div>
      ) : (
        <span className="flex-1" />
      )}
      {right.map((item, index) => {
        const previous = right[index - 1];
        const needsDivider = index > 0 && item.type === 'readout' && previous?.type === 'readout';
        return (
          <Fragment key={item.id}>
            {needsDivider && <span className={styles.divider} />}
            <PinnedItem item={item} />
          </Fragment>
        );
      })}
      {right.length > 0 && <span className={styles.divider} />}
      <OverflowMenu />
    </div>
  );
});

Bar.displayName = 'DevDockBar';

export default Bar;
