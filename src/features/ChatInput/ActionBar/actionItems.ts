import type { ComponentProps, CSSProperties, Key, MouseEvent, ReactNode } from 'react';

import type ActionIcon from '@/components/ActionIcon';

import type { ActionMenuItem } from '../menuItems';

export interface ChatActionEvent {
  domEvent: MouseEvent;
  key: string;
  keyPath: string[];
}
export interface ChatPlainAction {
  active?: boolean;
  alwaysDisplay?: boolean;
  children?: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  icon?: ComponentProps<typeof ActionIcon>['icon'];
  key?: Key;
  label?: ReactNode;
  loading?: boolean;
  onClick?: (event: MouseEvent) => void;
  tooltipProps?: ComponentProps<typeof ActionIcon>['tooltipProps'];
  type?: undefined;
  wrapper?: (node: ReactNode) => ReactNode;
}
export interface ChatDivider {
  alwaysDisplay?: boolean;
  key?: Key;
  type: 'divider';
}
export interface ChatCollapse {
  alwaysDisplay?: boolean;
  children: (ChatPlainAction | ChatDivider)[];
  key?: Key;
  type: 'collapse';
}
export interface ChatDropdown extends Omit<ChatPlainAction, 'type' | 'children'> {
  children: ActionMenuItem[];
  type: 'dropdown';
}
export type ChatActionItem = ChatPlainAction | ChatDivider | ChatCollapse | ChatDropdown;
export interface ChatInputActionsProps extends Omit<ComponentProps<'div'>, 'children'> {
  autoCollapse?: boolean;
  collapseOffset?: number;
  defaultGroupCollapse?: boolean;
  disabled?: boolean;
  gap?: number;
  groupCollapse?: boolean;
  items?: ChatActionItem[];
  onActionClick?: (action: ChatActionEvent) => void;
  onGroupCollapseChange?: (collapsed: boolean) => void;
  style?: CSSProperties;
}
