import { describe, expect, it } from 'vitest';

import { getVisibleSidebarSections } from './CustomizeSidebarModal';

/**
 * The fixed IA retires the old drag-sort customizer: core destinations stay
 * pinned and only optional sections can be hidden. This suite guards the
 * offer list the dialog is built from.
 */
describe('CustomizeSidebarModal', () => {
  it('offers the fixed-IA sections in contract order', () => {
    expect(getVisibleSidebarSections(true).map((section) => section.id)).toEqual([
      'inbox',
      'my-work',
      'reviews',
      'agent',
      'drafts',
      'workspace',
      'favorites',
      'teams',
    ]);
  });

  it('keeps core destinations pinned (not hideable)', () => {
    const pinned = getVisibleSidebarSections(true)
      .filter((section) => section.alwaysVisible)
      .map((section) => section.id);

    expect(pinned).toEqual(['inbox', 'my-work', 'reviews', 'agent', 'drafts']);
  });

  it('never offers retired sidebar keys', () => {
    const retired = [
      'home',
      'tasks',
      'automations',
      'resource',
      'recents',
      'private',
      'project',
      'views',
      'community',
      'image',
      'memory',
      'page',
      'pages',
    ];
    const offered = new Set(
      [...getVisibleSidebarSections(false), ...getVisibleSidebarSections(true)].map(
        (section) => section.id,
      ),
    );

    for (const id of retired) expect(offered.has(id)).toBe(false);
  });

  it('excludes the workspace-only Your teams group in personal mode', () => {
    const ids = getVisibleSidebarSections(false).map((section) => section.id);
    expect(ids).not.toContain('teams');
    expect(getVisibleSidebarSections(true).map((section) => section.id)).toContain('teams');
  });
});
