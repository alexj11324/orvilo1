import type { NeutralColors, PrimaryColors } from '@lobehub/ui';

import type { ResponseAnimationStyle } from '../../aiProvider';

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
  /** Shiki theme id, or `lobe-theme` to follow the app theme. */
  highlighterTheme?: string;
  isDevMode: boolean;
  isLiteMode: boolean;
  /** Mermaid palette id, or `lobe-theme` to follow the app theme. */
  mermaidTheme?: string;
  neutralColor?: NeutralColors;
  primaryColor?: PrimaryColors;
  responseLanguage?: string;
  telemetry: boolean;
  timezone?: string;
  transitionMode?: ResponseAnimationStyle;
}
