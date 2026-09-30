'use client';

import { createStaticStyles, cx } from 'antd-style';
import { memo, type ReactNode } from 'react';

import { devDockPanelStyles } from '@/features/DevDock/panelStyles';

const styles = createStaticStyles(({ css, cssVar }) => ({
  menu: css`
    padding-block: 4px;
    border-inline-end: none !important;

    .ant-menu-item,
    .ant-menu-submenu-title {
      width: 100%;
      margin-inline: 0;
      border-radius: 0;
    }
  `,
  menuItem: css`
    cursor: pointer;

    display: block;

    width: 100%;
    padding-block: 6px;
    padding-inline: 12px;
    border: none;
    border-radius: 0;

    font-size: 13px;
    color: ${cssVar.colorText};
    text-align: start;

    background: none;

    &:hover {
      background: ${cssVar.colorFillTertiary};
    }
  `,
  menuItemActive: css`
    color: ${cssVar.colorPrimary};
    background: ${cssVar.colorPrimaryBg};
  `,
  sidebar: css`
    display: flex;
    flex-direction: column;
    flex-shrink: 0;

    width: 260px;
    height: 100%;
    border-inline-end: 1px solid ${cssVar.colorBorderSecondary};

    background: ${cssVar.colorBgContainer};
  `,
  scroll: css`
    overflow: auto;
    flex: 1;
  `,
}));

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
      <div className="text-[13px] text-muted-foreground font-semibold">Builtin Tool Renders</div>
    </div>
    <div className={styles.scroll}>
      <div className={styles.menu} role="menu">
        {items.map((item) => (
          <button
            className={cx(styles.menuItem, item.key === selectedKey && styles.menuItemActive)}
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
