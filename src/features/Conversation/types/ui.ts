import { type ActionIconGroupItemType } from '@lobehub/ui';
import { type ChatItemProps } from '@lobehub/ui/chat';
import { type LLMRoleType, type UIChatMessage } from '@orvilo/types';
import { type FC, type ReactNode } from 'react';

export type RenderRole = LLMRoleType | 'default' | 'history' | string;
export type RenderMessage = FC<UIChatMessage & { editableContent: ReactNode }>;
export type RenderBelowMessage = FC<UIChatMessage>;
export type RenderMessageExtra = FC<UIChatMessage>;
export type MarkdownCustomRender = (props: {
  dom: ReactNode;
  id: string;
  text: string;
}) => ReactNode;

export type RenderItem = FC<{ key: string } & UIChatMessage & ListItemProps>;

/**
 * Action item with click handler
 */
export interface MessageActionItem extends ActionIconGroupItemType {
  /**
   * Submenu entries. Full actions rather than a narrower shape: a nested item
   * carries the same icon and label as it would at the top level, since the
   * same registered action can appear either way.
   */
  children?: MessageActionItem[];
  handleClick?: () => void | Promise<void>;
}

/**
 * Action item or divider
 */
export type MessageActionItemOrDivider = MessageActionItem | { type: 'divider' };

/**
 * A submenu slot: one menu entry that opens a nested list of actions. The
 * `key` names the registered action supplying the label/icon and `children`
 * lists the action keys nested under it. Structurally identical to the
 * `MessageActionGroupSlot` the action bar resolves at render time — declared
 * here so route-layer `useActionsBarConfig` menus can keep submenu groups
 * when they override a role's default menu.
 */
export interface MessageActionGroupSlot {
  /** Action keys to nest, in order. */
  children: string[];
  /** Registry key of the action that provides the submenu's label and icon. */
  key: string;
}

/**
 * Action slot reference. A registered action key (e.g. `'copy'`), the
 * reserved `'divider'` literal, or a submenu group slot.
 *
 * Uses declarative keys rather than pre-built items so per-message action
 * construction stays lazy and per-session/role config lives at the route
 * layer (see `useActionsBarConfig`).
 */
export type MessageActionSlot = string | MessageActionGroupSlot;

/**
 * Action configuration for a specific message type. Lists of registered
 * action keys resolved at render-time against the action registry.
 */
export interface MessageActionsConfig {
  /** Bar slots (always visible as icons) */
  bar?: MessageActionSlot[];
  /** Menu slots (overflow dropdown); when omitted the role's default menu is used */
  menu?: MessageActionSlot[];
}

/**
 * Actions bar configuration by message type
 */
export interface ActionsBarConfig {
  /**
   * Actions configuration for assistant messages
   */
  assistant?: MessageActionsConfig;
  /**
   * Actions configuration for assistant group messages
   * If not provided, falls back to `assistant` config
   */
  assistantGroup?: MessageActionsConfig;
  /**
   * Actions configuration for user messages
   */
  user?: MessageActionsConfig;
}

export interface ListItemProps {
  groupNav?: ChatItemProps['avatarAddon'];

  renderItems?: {
    [role: RenderRole]: RenderItem;
  };

  /**
   * @description Whether to show the chat item title
   * @default false
   */
  showTitle?: boolean;
}
