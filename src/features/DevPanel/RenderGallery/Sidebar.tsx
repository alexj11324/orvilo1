'use client';

import { cn } from 'cn';
import { memo, type ReactNode } from 'react';

import { devDockPanelStyles } from '@/features/DevDock/panelStyles';

import menuStyles from './Sidebar.module.css';

const styles = {
  menuItem:
    'cursor-pointer block w-full min-h-8 py-1 px-3 border-0 rounded-(--radius-button) text-sm leading-5.5 text-foreground text-start bg-none bg-transparent hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2',
  menuItemActive: 'text-foreground bg-selected hover:bg-selected',
  sidebar: 'flex flex-col shrink-0 w-65 h-full border-e border-divider bg-card',
  scroll: 'overflow-auto flex-1',
  menu: menuStyles.menu,
};

export interface DevMenuItem {
  key: string;
  label?: ReactNode;
}

interface SidebarProps {
  items: DevMenuItem[];
  onSelect: (key: string) => void;
  selectedKey?: string;
}

const Sidebar = memo<SidebarProps>(({ items, selectedKey, onSelect }) => (
  <aside className={styles.sidebar}>
    <div className={devDockPanelStyles.paneHeader}>
      <div className="text-sm leading-5.5 text-muted-foreground font-semibold">
        Builtin Tool Renders
      </div>
    </div>
    <div className={styles.scroll}>
      <div className={styles.menu} role="menu">
        {items.map((item) => (
          <button
            className={cn(styles.menuItem, item.key === selectedKey && styles.menuItemActive)}
            key={item.key}
            role="menuitem"
            onClick={() => onSelect(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  </aside>
));

export default Sidebar;
