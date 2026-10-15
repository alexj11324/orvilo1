import type { ResponseAnimationStyle } from '../../aiProvider';
import type {
  UserHighlighterTheme,
  UserMermaidTheme,
  UserNeutralColor,
  UserPrimaryColor,
} from './theme';

export type AnimationMode = 'disabled' | 'agile' | 'elegant';

export type ContextMenuMode = 'disabled' | 'default';

export interface UserGeneralConfig {
  animationMode?: AnimationMode;
  contextMenuMode?: ContextMenuMode;
  costEstimateWarningThreshold?: number;
  /**
   * Whether to auto-scroll during AI streaming output
   * @default true
   */
  enableAutoScrollOnStreaming?: boolean;
  /**
   * Whether to show the website/favicon icon before links in chat messages.
   * Turning it off renders plain links, which copy cleanly into email and other apps.
   * @default true
   */
  enableMessageLinkIcon?: boolean;
  /**
   * Whether a turn's tool workflow starts expanded while the agent is still
   * running. Off keeps the running turn to a single live headline row.
   * @default false
   */
  expandWorkflowWhileStreaming?: boolean;
  fontSize: number;
  highlighterTheme?: UserHighlighterTheme;
  isDevMode: boolean;
  isLiteMode: boolean;
  mermaidTheme?: UserMermaidTheme;
  neutralColor?: UserNeutralColor;
  primaryColor?: UserPrimaryColor;
  responseLanguage?: string;
  telemetry: boolean;
  timezone?: string;
  transitionMode?: ResponseAnimationStyle;
}
