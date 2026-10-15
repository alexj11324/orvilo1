import type { ResponseAnimationStyle } from '../../aiProvider';

/**
 * Stored accent (primary) colour names. The OKLCH seed for each name lives in
 * `src/styles/theme/seeds.ts`; names stay stable so saved settings keep working.
 */
export type PrimaryColorName =
  | 'blue'
  | 'cyan'
  | 'geekblue'
  | 'gold'
  | 'green'
  | 'lime'
  | 'magenta'
  | 'orange'
  | 'purple'
  | 'red'
  | 'volcano'
  | 'yellow';

/** Stored base (neutral) colour names; unset means the default `gray` base. */
export type NeutralColorName = 'mauve' | 'olive' | 'sage' | 'sand' | 'slate';

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
  neutralColor?: NeutralColorName;
  primaryColor?: PrimaryColorName;
  responseLanguage?: string;
  telemetry: boolean;
  timezone?: string;
  transitionMode?: ResponseAnimationStyle;
}
