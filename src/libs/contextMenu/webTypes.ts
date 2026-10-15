import type { SFSymbol } from '@orvilo/electron-client-ipc';
import type { ComponentProps, ElementType, Key, ReactNode } from 'react';

import type { MenuInfo } from '@/components/ItemsMenu/menuItems';
import type { ContextMenuSub } from '@/components/ui/context-menu';

export type { MenuInfo } from '@/components/ItemsMenu/menuItems';

export interface ContextMenuItemData {
  checked?: boolean;
  children?: ContextMenuItem[];
  closeDelay?: number;
  closeOnClick?: boolean;
  danger?: boolean;
  defaultChecked?: boolean;
  defaultOpen?: boolean;
  delay?: number;
  desc?: ReactNode;
  disabled?: boolean;
  extra?: ReactNode;
  footer?: ReactNode;
  header?: ReactNode;
  icon?: ElementType | ReactNode;
  key?: Key;
  label?: ReactNode;
  loading?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onClick?: (info: MenuInfo) => void;
  onOpenChange?: ComponentProps<typeof ContextMenuSub>['onOpenChange'];
  onTitleMouseEnter?: (info: { domEvent: unknown; key: string }) => void;
  open?: boolean;
  openOnHover?: boolean;
  sfSymbol?: SFSymbol;
  title?: ReactNode;
  triggerProps?: ComponentProps<'div'>;
  type?: 'checkbox' | 'divider' | 'group' | 'submenu' | 'switch';
}
export type ContextMenuItem = ContextMenuItemData | null;
export interface ShowContextMenuOptions {
  footer?: ReactNode;
  header?: ReactNode;
  iconAlign?: 'center' | 'start';
  iconSpaceMode?: 'global' | 'group';
}
