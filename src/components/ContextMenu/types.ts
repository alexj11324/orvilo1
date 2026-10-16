import type { ElementType, Key, KeyboardEvent, MouseEvent, ReactNode } from 'react';

/** What an item's `onClick` receives; the rendered menu reports the pointer or key event. */
export interface ContextMenuInfo {
  domEvent: KeyboardEvent<HTMLElement> | MouseEvent<HTMLElement>;
  item: EventTarget & Element;
  key: string;
  keyPath: string[];
}

type MenuIcon = ElementType | ReactNode;

interface ContextMenuActionItem {
  children?: ContextMenuItem[];
  className?: string;
  closeOnClick?: boolean;
  danger?: boolean;
  defaultOpen?: boolean;
  desc?: ReactNode;
  disabled?: boolean;
  extra?: ReactNode;
  /** Pinned footer slot of a submenu. */
  footer?: ReactNode;
  /** Pinned header slot of a submenu. */
  header?: ReactNode;
  icon?: MenuIcon;
  key?: Key;
  label?: ReactNode;
  loading?: boolean;
  onClick?: (info: ContextMenuInfo) => void;
  onOpenChange?: (open: boolean) => void;
  /** Submenu hover hook honored by fallback renderers such as the sidebar dropdown. */
  onTitleMouseEnter?: (info: { domEvent: unknown; key: string }) => void;
  open?: boolean;
  openOnHover?: boolean;
  title?: string;
  type?: 'item' | 'submenu';
}

interface ContextMenuGroupItem {
  children?: ContextMenuItem[];
  key?: Key;
  label?: ReactNode;
  type: 'group';
}

interface ContextMenuDividerItem {
  dashed?: boolean;
  key?: Key;
  type: 'divider';
}

interface ContextMenuToggleItem {
  checked?: boolean;
  closeOnClick?: boolean;
  danger?: boolean;
  defaultChecked?: boolean;
  desc?: ReactNode;
  disabled?: boolean;
  extra?: ReactNode;
  icon?: MenuIcon;
  key: Key;
  label?: ReactNode;
  onCheckedChange?: (checked: boolean) => void;
  title?: ReactNode;
  type: 'checkbox' | 'switch';
}

/** Item union accepted by the imperative web context menu. `null` entries are skipped. */
export type ContextMenuItem =
  | ContextMenuActionItem
  | ContextMenuDividerItem
  | ContextMenuGroupItem
  | ContextMenuToggleItem
  | null;

export interface ShowContextMenuOptions {
  /** Pinned slot rendered below the items. */
  footer?: ReactNode;
  /** Pinned slot rendered above the items. */
  header?: ReactNode;
}
