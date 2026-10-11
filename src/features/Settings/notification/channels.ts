import type { NotificationSettings } from '@orvilo/types';

/**
 * Channels whose stored preference changes what is delivered. Inbox records are
 * always kept and email has no sender, so neither is offered as a control.
 */
export const NOTIFICATION_CHANNELS = [
  'push',
] as const satisfies readonly (keyof NotificationSettings)[];

export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
