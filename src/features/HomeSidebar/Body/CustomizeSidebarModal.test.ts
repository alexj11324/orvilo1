import { describe, expect, it } from 'vitest';

import { SIDEBAR_SPACER_ID } from '@/store/global/selectors/systemStatus';

import { getAvailableSidebarItems, getSortableSidebarItemIds } from './CustomizeSidebarModal';

/**
 * Sidebar ids whose product surface has been withdrawn. Offering one in this
 * dialog is worse than useless: confirming writes the selection into
 * `sidebarItems`, the read path strips retired keys straight back out, and the
 * user sees a switch that flips and then silently reverts on the next open.
 */
const RETIRED_IDS = ['community', 'image', 'memory', 'pages'];

describe('CustomizeSidebarModal', () => {
  it.each(RETIRED_IDS)('never offers the retired "%s" item', (id) => {
    expect(getAvailableSidebarItems(false).some((item) => item.id === id)).toBe(false);
    expect(getAvailableSidebarItems(true).some((item) => item.id === id)).toBe(false);
  });

  it.each(RETIRED_IDS)('leaves the retired "%s" id out of the sortable set', (id) => {
    expect(getSortableSidebarItemIds(false).has(id)).toBe(false);
    expect(getSortableSidebarItemIds(true).has(id)).toBe(false);
  });

  it('still offers every surviving destination', () => {
    const ids = getAvailableSidebarItems(false).map((item) => item.id);

    expect(ids).toContain('inbox');
    expect(ids).toContain('my-work');
    expect(ids).toContain('tasks');
    expect(ids).toContain('views');
    expect(ids).toContain('automations');
    expect(ids).toContain('resource');
    expect(ids).toContain('project');
    expect(ids).not.toContain('teams');
    expect(getAvailableSidebarItems(true).map((item) => item.id)).toContain('teams');
  });

  it('allows Projects to be reordered and hidden', () => {
    expect(getAvailableSidebarItems(false).some((item) => item.id === 'project')).toBe(true);
    expect(getSortableSidebarItemIds(false).has('project')).toBe(true);
  });

  it('keeps the spacer in the sortable item set', () => {
    expect(getSortableSidebarItemIds(false).has(SIDEBAR_SPACER_ID)).toBe(true);
    expect(getSortableSidebarItemIds(true).has(SIDEBAR_SPACER_ID)).toBe(true);
  });

  it('keeps the remaining workspace-only exclusions in the sortable item set', () => {
    // `private` is workspace-only: in personal mode every row is implicitly
    // owner-private, so it is not offered there.
    expect(getSortableSidebarItemIds(false).has('private')).toBe(false);
    expect(getSortableSidebarItemIds(true).has('private')).toBe(true);
    expect(getSortableSidebarItemIds(false).has('teams')).toBe(false);
    expect(getSortableSidebarItemIds(true).has('teams')).toBe(true);
  });
});
