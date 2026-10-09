import { type ChatSettingsTabs } from '@/store/global/initialState';

/**
 * Pick the tab to show: the user's choice while it is still offered, otherwise
 * the first tab that has content. The offered tabs change with the agent
 * (labs gate Rules, feature flags gate Self-iteration), so a fixed initial tab can point at
 * nothing.
 */
export const resolveActiveTab = (
  items: ReadonlyArray<{ key?: unknown } | null | undefined> | undefined,
  selected: ChatSettingsTabs | undefined,
): ChatSettingsTabs | undefined => {
  const keys = (items ?? []).flatMap((item) =>
    typeof item?.key === 'string' ? [item.key as ChatSettingsTabs] : [],
  );

  return selected && keys.includes(selected) ? selected : keys[0];
};
