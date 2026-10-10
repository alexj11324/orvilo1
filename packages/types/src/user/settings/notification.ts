export interface NotificationChannelSettings {
  enabled?: boolean;
  /** Per-type overrides grouped by category. Missing = use scenario default (true) */
  items?: Record<string, Record<string, boolean>>;
}

export interface NotificationSettings {
  email?: NotificationChannelSettings;
  inbox?: NotificationChannelSettings;
  /**
   * Mobile push notifications (delivered via Expo Push Service → APNs/FCM).
   * Only takes effect for users with a registered Expo push token —
   * see `push_tokens` table.
   */
  push?: NotificationChannelSettings;
}

/** Event switches shared by inbox projection and the settings surfaces. */
export const WORK_NOTIFICATION_EVENTS = [
  'task_assigned',
  'task_review',
  'task_status_changed',
  'agent_run_completed',
  'agent_run_failed',
  'acp_permission',
] as const;

export const notificationEventEnabled = (
  settings: NotificationSettings | undefined,
  channel: keyof NotificationSettings,
  event: string,
): boolean =>
  settings?.[channel]?.enabled !== false && settings?.[channel]?.items?.work?.[event] !== false;
