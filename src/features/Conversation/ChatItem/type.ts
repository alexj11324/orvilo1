import type { ComponentProps, ReactNode } from 'react';

import type { AvatarProps } from '@/components/Avatar';
import type { ErrorAlertProps } from '@/features/Conversation/components/ErrorAlert';

/**
 * Avatar metadata. It predates the agent's `name`/`title` split, so the base
 * shape only carries `title`. Every caller in this app passes an agent meta that also
 * has `name` (see `useAgentMeta`), which is what the author label resolves from.
 */
export interface ChatItemMetaData {
  avatar?: string | ReactNode;
  backgroundColor?: string;
  description?: string;
  tags?: string[];
  title?: string;
}

export type ChatItemAvatarMeta = ChatItemMetaData & { agentId?: string; name?: string | null };

export interface ChatItemProps extends Omit<ComponentProps<'div'>, 'children' | 'onChange'> {
  aboveMessage?: ReactNode;
  actionAddon?: ReactNode;
  actions?: ReactNode;
  actionsWrapWidth?: number;
  afterActions?: ReactNode;
  /** Opt in only for assistant identities; users and tool rows retain their own fallback. */
  assistantAvatar?: boolean;
  avatar: ChatItemAvatarMeta;
  avatarProps?: AvatarProps;
  belowMessage?: ReactNode;
  children?: ReactNode;
  customAvatarRender?: (avatar: ChatItemAvatarMeta, node: ReactNode) => ReactNode;
  customErrorRender?: (error: ErrorAlertProps) => ReactNode;
  /**
   * @description Whether the chat item is disabled
   * @default false
   */
  disabled?: boolean;
  /**
   * @description Whether the chat item is in editing mode
   */
  editing?: boolean;
  /**
   * @description Props for Error render
   */
  error?: ErrorAlertProps;
  fontSize?: number;
  /** Rendered in the header row next to the time, independent of `showTitle`. */
  headerAddon?: ReactNode;
  /**
   * @description Whether the chat item is in loading state
   */
  loading?: boolean;
  /**
   * @description The message content of the chat item
   */
  message?: ReactNode;
  messageExtra?: ReactNode;
  /**
   * Avatar click handler
   */
  onAvatarClick?: () => void;
  onDoubleClick?: ComponentProps<'div'>['onDoubleClick'];
  /**
   * @default "..."
   */
  placeholderMessage?: string;
  /**
   * @description The placement of the chat item
   * @default 'left'
   */
  placement?: 'left' | 'right';
  /**
   * @description Whether to hide the avatar
   * @default false
   */
  showAvatar?: boolean;
  /**
   * @description Whether to show the title of the chat item
   */
  showTitle?: boolean;
  text?: {
    cancel?: string;
    confirm?: string;
    edit?: string;
    title?: string;
  };
  /**
   * @description The timestamp of the chat item
   */
  time?: number;
  titleAddon?: ReactNode;
}
