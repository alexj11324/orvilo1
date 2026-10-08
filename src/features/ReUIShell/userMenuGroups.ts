import type { SidebarMenuItems } from '@/features/NavPanel/components/SidebarDropdownMenu';

export interface UserMenuGroups {
  /** Help and app entries: cloud promotion, Get App. */
  help: SidebarMenuItems;
  /** Per-user entries: data import and any business-supplied items. */
  personal: SidebarMenuItems;
  /** Workspace-scoped entries: Settings (carries the update badge). */
  workspace: SidebarMenuItems;
}

const WORKSPACE_KEYS = new Set(['setting']);
const HELP_KEYS = new Set(['cloud', 'get-app']);

const isRenderable = (item: SidebarMenuItems[number]): item is NonNullable<typeof item> =>
  Boolean(item) && (item as { type?: string }).type !== 'divider';

/**
 * Splits the flat, divider-separated list returned by `useMenu().mainItems` into the
 * groups the workspace menu renders. Dividers and empty entries are dropped (the menu owns
 * its own separators); unknown keys, such as business items, default to `personal`.
 */
export const groupUserMenuItems = (items: SidebarMenuItems = []): UserMenuGroups => {
  const groups: UserMenuGroups = { help: [], personal: [], workspace: [] };

  for (const item of items.filter(isRenderable)) {
    const key = String((item as { key?: unknown }).key ?? '');
    if (WORKSPACE_KEYS.has(key)) groups.workspace.push(item);
    else if (HELP_KEYS.has(key)) groups.help.push(item);
    else groups.personal.push(item);
  }

  return groups;
};
