import type { NotificationChannelSettings, NotificationSettings } from '@orvilo/types';

/**
 * Merge one channel-settings patch over the stored value, keeping sibling
 * `items` categories and leaves intact.
 */
const mergeChannelSettings = (
  current: NotificationChannelSettings | undefined,
  patch: NotificationChannelSettings,
): NotificationChannelSettings => {
  const mergedItems: Record<string, Record<string, boolean>> = {
    ...current?.items,
    ...patch.items,
  };
  const items = patch.items
    ? Object.fromEntries(
        Object.keys(mergedItems).map((category) => [
          category,
          { ...current?.items?.[category], ...mergedItems[category] },
        ]),
      )
    : current?.items;
  return {
    ...current,
    ...patch,
    ...(items ? { items } : {}),
  };
};

export const mergeNotificationSettings = (
  current: NotificationSettings | undefined,
  patch: NotificationSettings,
): NotificationSettings => {
  const next: NotificationSettings = { ...current };
  for (const [channel, channelPatch] of Object.entries(patch)) {
    if (!channelPatch) continue;
    const key = channel as keyof NotificationSettings;
    next[key] = mergeChannelSettings(next[key], channelPatch as NotificationChannelSettings);
  }
  return next;
};
