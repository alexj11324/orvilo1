import type { WorkRegistrationIntent } from '@orvilo/types';

/** Neutral mirror of the server `ToolExecutionResultResponse`. */
export interface ToolRunResult {
  content: string;
  /** Server tool paused (client/device dispatch) — result arrives later. */
  deferred?: boolean;
  /**
   * Wall time the tool took on the DEVICE, by the device's own clock, when the
   * call was dispatched to one. Paired with the server-observed
   * `executionTime`, the difference is pure dispatch overhead — the number that
   * decides whether moving the agent loop onto the device is worth it.
   */
  deviceExecutionTime?: number;
  error?: unknown;
  executionTime?: number;
  state?: Record<string, any>;
  /** Tool result requests the current runtime flow to stop. */
  stop?: boolean;
  success: boolean;
  /**
   * Work-registration intent produced by the tool execution (task / skill /
   * document identity). The executor forwards it to
   * `ToolTransport.registerWork` once cumulative cost is known.
   */
  workRegistration?: WorkRegistrationIntent;
}
