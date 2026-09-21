import { describe, expect, it, vi } from 'vitest';

import { merge } from '@/utils/merge';

import type { GlobalState } from '../initialState';
import {
  DEFAULT_HOME_SIDEBAR_EXPANDED_KEYS,
  INITIAL_STATUS,
  initialState,
  MODEL_DETAIL_PANEL_EXPANDABLE_KEYS,
} from '../initialState';
import {
  DEFAULT_SIDEBAR_ITEMS,
  readOverridableField,
  reorderSidebarItems,
  routeOverlayWrites,
  SIDEBAR_SPACER_ID,
  systemStatusSelectors,
} from './systemStatus';

// Mock version constants
vi.mock('@/const/version', () => ({
  isServerMode: false,
  isUsePgliteDB: true,
}));

describe('systemStatusSelectors', () => {
  describe('sessionGroupKeys', () => {
    it('should return expandSessionGroupKeys from status', () => {
      const s: GlobalState = merge(initialState, {
        status: {
          expandSessionGroupKeys: ['group1', 'group2'],
        },
      });
      expect(systemStatusSelectors.sessionGroupKeys(null)(s)).toEqual(['group1', 'group2']);
    });

    it('should return initial value if not set', () => {
      const s: GlobalState = merge(initialState, {
        status: {
          expandSessionGroupKeys: undefined,
        },
      });
      expect(systemStatusSelectors.sessionGroupKeys(null)(s)).toEqual(
        INITIAL_STATUS.expandSessionGroupKeys,
      );
    });
  });

  describe('basic selectors', () => {
    const s: GlobalState = merge(initialState, {
      status: {
        showSystemRole: true,
        mobileShowTopic: true,
        mobileShowPortal: true,
        showAgentBuilderPanel: true,
        showRightPanel: true,
        showLeftPanel: true,
        showFilePanel: true,
        hidePWAInstaller: true,
        isShowCredit: true,
        leftPanelWidth: 300,
        portalWidth: 500,
        filePanelWidth: 400,
        inputHeight: 150,
        threadInputHeight: 100,
      },
    });

    it('should return correct values for basic selectors', () => {
      expect(systemStatusSelectors.showSystemRole(s)).toBe(true);
      expect(systemStatusSelectors.mobileShowTopic(s)).toBe(true);
      expect(systemStatusSelectors.mobileShowPortal(s)).toBe(true);
      expect(systemStatusSelectors.showAgentBuilderPanel(s)).toBe(true);
      expect(systemStatusSelectors.showRightPanel(s)).toBe(true);
      expect(systemStatusSelectors.showLeftPanel(s)).toBe(true);
      expect(systemStatusSelectors.showFilePanel(s)).toBe(true);
      expect(systemStatusSelectors.hidePWAInstaller(s)).toBe(true);
      expect(systemStatusSelectors.isShowCredit(s)).toBe(true);
      expect(systemStatusSelectors.leftPanelWidth(s)).toBe(300);
      expect(systemStatusSelectors.portalWidth(s)).toBe(500);
      expect(systemStatusSelectors.filePanelWidth(s)).toBe(400);
      expect(systemStatusSelectors.wideScreen(s)).toBe(false);
    });

    it('should return default portal width if not set', () => {
      const noPortalWidth = merge(initialState, {
        status: { portalWidth: undefined },
      });
      expect(systemStatusSelectors.portalWidth(noPortalWidth)).toBe(400);
    });

    it('should return workingSidebarWidth from status, defaulting to 360', () => {
      expect(
        systemStatusSelectors.workingSidebarWidth(
          merge(initialState, {
            status: { workingSidebarWidth: 520 },
          }),
        ),
      ).toBe(520);

      expect(
        systemStatusSelectors.workingSidebarWidth(
          merge(initialState, {
            status: { workingSidebarWidth: undefined },
          }),
        ),
      ).toBe(360);
    });

    it('should clamp persisted left panel width to the draggable panel bounds', () => {
      expect(
        systemStatusSelectors.leftPanelWidth(
          merge(initialState, {
            status: { leftPanelWidth: 120 },
          }),
        ),
      ).toBe(240);

      expect(
        systemStatusSelectors.leftPanelWidth(
          merge(initialState, {
            status: { leftPanelWidth: 720 },
          }),
        ),
      ).toBe(400);

      expect(
        systemStatusSelectors.leftPanelWidth(
          merge(initialState, {
            status: { leftPanelWidth: '360px' as unknown as number },
          }),
        ),
      ).toBe(360);
    });
  });

  describe('modelDetailPanelExpandedKeys', () => {
    it('should expand every section by default', () => {
      const s: GlobalState = {
        ...initialState,
        status: {
          ...initialState.status,
          modelDetailPanelCollapsedKeys: undefined,
        },
      };

      expect(systemStatusSelectors.modelDetailPanelExpandedKeys(s)).toEqual(
        MODEL_DETAIL_PANEL_EXPANDABLE_KEYS,
      );
    });

    it('should exclude collapsed keys stored by the user', () => {
      const s: GlobalState = merge(initialState, {
        status: {
          modelDetailPanelCollapsedKeys: ['abilities', 'config'],
        },
      });

      expect(systemStatusSelectors.modelDetailPanelExpandedKeys(s)).toEqual(['rating', 'pricing']);
    });

    it('should ignore a legacy persisted expanded-keys array and keep new sections expanded', () => {
      // before the collapsed-keys migration, an expanded-keys array persisted prior to the
      // rating section shipping kept it collapsed forever — the legacy field must be inert
      const s: GlobalState = merge(initialState, {
        status: {
          modelDetailPanelExpandedKeys: ['pricing', 'config'],
        } as never,
      });

      expect(systemStatusSelectors.modelDetailPanelExpandedKeys(s)).toEqual(
        MODEL_DETAIL_PANEL_EXPANDABLE_KEYS,
      );
    });
  });

  describe('taskListViewMode', () => {
    it('should restore the persisted task board view', () => {
      const s: GlobalState = {
        ...initialState,
        status: {
          ...initialState.status,
          taskListViewMode: 'kanban',
        },
      };

      expect(systemStatusSelectors.taskListViewMode(s)).toBe('kanban');
    });

    it('should default status without a task view mode to the list', () => {
      const s: GlobalState = {
        ...initialState,
        status: {
          ...initialState.status,
          taskListViewMode: undefined,
        },
      };

      expect(systemStatusSelectors.taskListViewMode(s)).toBe('list');
    });

    it('keeps an explicitly stored list preference', () => {
      // A stored `list` is indistinguishable from a deliberate choice, so it is
      // preserved rather than migrated to the new default.
      const s: GlobalState = {
        ...initialState,
        status: { ...initialState.status, taskListViewMode: 'list' },
      };

      expect(systemStatusSelectors.taskListViewMode(s)).toBe('list');
    });

    it('seeds the grouped list — and only canceled folded away — for a brand-new user', () => {
      // The store seed, not the selector fallback, is what a new user actually
      // gets. Defaults for this live in both layers, so changing one without the
      // other would leave the default silently split between them.
      expect(INITIAL_STATUS.taskListViewMode).toBe('list');
      expect(INITIAL_STATUS.taskKanbanHiddenColumns).toEqual(['canceled']);
    });
  });

  describe('taskKanbanHiddenColumns', () => {
    it('shows the done column by default', () => {
      const s: GlobalState = {
        ...initialState,
        status: { ...initialState.status, taskKanbanHiddenColumns: undefined },
      };

      expect(systemStatusSelectors.taskKanbanHiddenColumns(s)).toEqual(['canceled']);
    });

    it('keeps a stored hidden-column preference', () => {
      const s: GlobalState = {
        ...initialState,
        status: { ...initialState.status, taskKanbanHiddenColumns: ['done', 'canceled'] },
      };

      expect(systemStatusSelectors.taskKanbanHiddenColumns(s)).toEqual(['done', 'canceled']);
    });
  });

  describe('sidebarItems', () => {
    it('should return DEFAULT_SIDEBAR_ITEMS when no data is set', () => {
      expect(systemStatusSelectors.sidebarItems(null)(initialState)).toEqual(DEFAULT_SIDEBAR_ITEMS);
    });

    it('always yields the canonical order — a stored legacy order cannot reorder or resurrect', () => {
      // The stored order is a pre-convergence one: retired keys and a custom
      // arrangement. The fixed IA ignores it entirely.
      const stored = [
        'private',
        'agent',
        'recents',
        'pages',
        'tasks',
        'image',
        'community',
        'resource',
        'memory',
      ];
      const s: GlobalState = merge(initialState, {
        status: { sidebarItems: stored },
      });
      expect(systemStatusSelectors.sidebarItems(null)(s)).toEqual(DEFAULT_SIDEBAR_ITEMS);
    });

    it('ignores legacy `sidebarSectionOrder` — accordion order is contract-owned now', () => {
      const s: GlobalState = merge(initialState, {
        status: { sidebarSectionOrder: ['agent', 'recents'] },
      });
      expect(systemStatusSelectors.sidebarItems(null)(s)).toEqual(DEFAULT_SIDEBAR_ITEMS);
    });

    it('returns the canonical order for a workspace overlay too', () => {
      const s: GlobalState = merge(initialState, {
        status: {
          sidebarItems: ['tasks'],
          workspace: { sidebarItems: ['automations', 'image', 'recents', 'agent', 'memory'] },
        },
      });
      expect(systemStatusSelectors.sidebarItems('ws-1')(s)).toEqual(DEFAULT_SIDEBAR_ITEMS);
    });
  });

  describe('retired sidebar items', () => {
    // Retired keys can never resurface through persisted state: sidebarItems is
    // a constant now, and hidden/expanded lists still strip them on read.
    const RETIRED = [
      'community',
      'image',
      'memory',
      'page',
      'pages',
      'home',
      'tasks',
      'automations',
      'resource',
      'recents',
      'private',
      'project',
      'views',
    ];

    it.each(RETIRED)(
      'strips the retired "%s" key from hidden sections and expanded keys',
      (key) => {
        const s: GlobalState = merge(initialState, {
          status: {
            hiddenSidebarSections: [key],
            sidebarExpandedKeys: [key],
          },
        });

        expect(systemStatusSelectors.hiddenSidebarSections(null)(s)).not.toContain(key);
        expect(systemStatusSelectors.sidebarExpandedKeys(null)(s)).not.toContain(key);
      },
    );

    it('keeps surviving hideable sections in hiddenSidebarSections', () => {
      const s: GlobalState = merge(initialState, {
        status: { hiddenSidebarSections: ['workspace', 'favorites'] },
      });

      expect(systemStatusSelectors.hiddenSidebarSections(null)(s)).toEqual([
        'workspace',
        'favorites',
      ]);
    });

    it('keeps surviving expanded keys while dropping retired ones', () => {
      const s: GlobalState = merge(initialState, {
        status: { sidebarExpandedKeys: ['agent', 'image', 'teams'] },
      });

      expect(systemStatusSelectors.sidebarExpandedKeys(null)(s)).toEqual(['agent', 'teams']);
    });
  });

  describe('sidebarExpandedKeys', () => {
    it('should expand sidebar accordion sections by default', () => {
      const s: GlobalState = {
        ...initialState,
        status: {
          ...initialState.status,
          sidebarExpandedKeys: undefined,
        },
      };

      expect(systemStatusSelectors.sidebarExpandedKeys(null)(s)).toEqual(
        DEFAULT_HOME_SIDEBAR_EXPANDED_KEYS,
      );
    });

    it('should preserve an empty stored preference when all sections are collapsed', () => {
      const s: GlobalState = merge(initialState, {
        status: { sidebarExpandedKeys: [] },
      });

      expect(systemStatusSelectors.sidebarExpandedKeys(null)(s)).toEqual([]);
    });
  });

  describe('reorderSidebarItems', () => {
    // Synthetic fixture: two top-group slots (alpha + the non-accordion
    // `agent` flat row), the accordion block (workspace/favorites/teams), the
    // spacer, then three bottom-group slots. `reorderSidebarItems` is
    // key-agnostic — it only consults SIDEBAR_ACCORDION_KEYS membership — so
    // non-accordion names here are placeholders that keep the shape wide
    // enough to exercise the rules.
    const DEFAULT = [
      'alpha',
      'agent',
      'workspace',
      'favorites',
      'teams',
      SIDEBAR_SPACER_ID,
      'beta',
      'gamma',
      'delta',
    ];

    it('should move a non-accordion item normally', () => {
      // move `beta` (idx 6) up to idx 0
      expect(reorderSidebarItems(DEFAULT, 6, 0)).toEqual([
        'beta',
        'alpha',
        'agent',
        'workspace',
        'favorites',
        'teams',
        SIDEBAR_SPACER_ID,
        'gamma',
        'delta',
      ]);
    });

    it('should snap a top-group item past the accordion when dragged between accordion items (drag down)', () => {
      // `alpha` (idx 0) dragged down to idx 2 (between agent & workspace) →
      // pushed past the accordion, lands in the bottom group.
      expect(reorderSidebarItems(DEFAULT, 0, 2)).toEqual([
        'agent',
        'workspace',
        'favorites',
        'teams',
        SIDEBAR_SPACER_ID,
        'alpha',
        'beta',
        'gamma',
        'delta',
      ]);
    });

    it('should snap a bottom-group item before the accordion when dragged between accordion items (drag up)', () => {
      // `beta` (idx 6) dragged up to idx 2 (between agent & workspace) →
      // lands ahead of the accordion (top group).
      expect(reorderSidebarItems(DEFAULT, 6, 2)).toEqual([
        'alpha',
        'agent',
        'beta',
        'workspace',
        'favorites',
        'teams',
        SIDEBAR_SPACER_ID,
        'gamma',
        'delta',
      ]);
    });

    it('should move the non-accordion `agent` flat row normally past the block', () => {
      // `agent` (idx 1) moveUp → idx 0. `agent` is a core flat row, not an
      // accordion member, so this is a plain move — the block stays put.
      expect(reorderSidebarItems(DEFAULT, 1, 0)).toEqual([
        'agent',
        'alpha',
        'workspace',
        'favorites',
        'teams',
        SIDEBAR_SPACER_ID,
        'beta',
        'gamma',
        'delta',
      ]);
    });

    it('should snap the accordion back when moving `teams` down past the spacer', () => {
      // `teams` (idx 4) moveDown → idx 5 (past spacer). Normalization re-anchors
      // the spacer behind the accordion, making the move a visible no-op.
      expect(reorderSidebarItems(DEFAULT, 4, 5)).toBe(DEFAULT);
    });

    it('should snap the non-accordion `agent` past the block when dragged down into it', () => {
      // `agent` (idx 1) moveDown → idx 2 (workspace's slot, the block start).
      // A non-accordion item dropped into the block snaps past it.
      expect(reorderSidebarItems(DEFAULT, 1, 2)).toEqual([
        'alpha',
        'workspace',
        'favorites',
        'teams',
        SIDEBAR_SPACER_ID,
        'agent',
        'beta',
        'gamma',
        'delta',
      ]);
    });

    it('should be a no-op when from === to', () => {
      expect(reorderSidebarItems(DEFAULT, 2, 2)).toBe(DEFAULT);
    });

    it('should keep the spacer behind the accordion after moving a non-accordion item', () => {
      // Move `alpha` (idx 0) to the very end. Spacer stays right after `teams`.
      const next = reorderSidebarItems(DEFAULT, 0, DEFAULT.length - 1);
      const spacerIdx = next.indexOf(SIDEBAR_SPACER_ID);
      expect(next[spacerIdx - 1]).toBe('teams');
      expect(next.at(-1)).toBe('alpha');
    });
  });

  describe('workspace overlay', () => {
    describe('readOverridableField', () => {
      it('returns the top-level value when workspaceId is null', () => {
        const status = {
          ...initialState.status,
          expandSessionGroupKeys: ['personal'],
          workspace: { expandSessionGroupKeys: ['ws'] },
        };
        expect(readOverridableField(status, 'expandSessionGroupKeys', null)).toEqual(['personal']);
      });

      it('returns the overlay value when workspaceId is set and overlay carries the field', () => {
        const status = {
          ...initialState.status,
          expandSessionGroupKeys: ['personal'],
          workspace: { expandSessionGroupKeys: ['ws'] },
        };
        expect(readOverridableField(status, 'expandSessionGroupKeys', 'ws-1')).toEqual(['ws']);
      });

      it('falls back to top-level when overlay is missing the field', () => {
        const status = {
          ...initialState.status,
          hiddenSidebarSections: ['recents'],
          workspace: { expandSessionGroupKeys: ['ws'] },
        };
        expect(readOverridableField(status, 'hiddenSidebarSections', 'ws-1')).toEqual(['recents']);
      });
    });

    describe('selectors honour the overlay', () => {
      const stateWithOverlay: GlobalState = merge(initialState, {
        status: {
          expandSessionGroupKeys: ['personal-group'],
          hiddenSidebarSections: [],
          sidebarItems: undefined,
          sidebarExpandedKeys: ['recents', 'agent', 'private'],
          workspace: {
            expandSessionGroupKeys: ['ws-group'],
            hiddenSidebarSections: ['workspace'],
            sidebarExpandedKeys: ['agent'],
          },
        },
      });

      it('sessionGroupKeys prefers overlay in workspace mode', () => {
        expect(systemStatusSelectors.sessionGroupKeys('ws-1')(stateWithOverlay)).toEqual([
          'ws-group',
        ]);
      });

      it('sessionGroupKeys returns personal value in personal mode', () => {
        expect(systemStatusSelectors.sessionGroupKeys(null)(stateWithOverlay)).toEqual([
          'personal-group',
        ]);
      });

      it('hiddenSidebarSections prefers overlay in workspace mode', () => {
        expect(systemStatusSelectors.hiddenSidebarSections('ws-1')(stateWithOverlay)).toEqual([
          'workspace',
        ]);
      });

      it('sidebarExpandedKeys prefers overlay in workspace mode', () => {
        expect(systemStatusSelectors.sidebarExpandedKeys('ws-1')(stateWithOverlay)).toEqual([
          'agent',
        ]);
      });

      it('sidebarItems falls back to default when overlay omits and top-level omits', () => {
        // Both top-level and workspace.sidebarItems are undefined → default
        expect(systemStatusSelectors.sidebarItems('ws-1')(stateWithOverlay)).toEqual(
          DEFAULT_SIDEBAR_ITEMS,
        );
      });

      it('shows every section by default in workspace mode when overlay is untouched', () => {
        const s: GlobalState = merge(initialState, {
          status: { hiddenSidebarSections: undefined, workspace: undefined },
        });
        expect(systemStatusSelectors.hiddenSidebarSections('ws-1')(s)).toEqual([]);
      });

      it('keeps everything visible in personal mode by default', () => {
        const s: GlobalState = merge(initialState, {
          status: { hiddenSidebarSections: undefined, workspace: undefined },
        });
        expect(systemStatusSelectors.hiddenSidebarSections(null)(s)).toEqual([]);
      });

      it('inherits personal-mode hides into an untouched workspace overlay', () => {
        const s: GlobalState = merge(initialState, {
          status: { hiddenSidebarSections: ['favorites'], workspace: undefined },
        });
        expect(systemStatusSelectors.hiddenSidebarSections('ws-1')(s)).toEqual(['favorites']);
      });

      it('respects an explicit empty overlay as "show everything in this workspace"', () => {
        const s: GlobalState = merge(initialState, {
          status: { hiddenSidebarSections: ['recents'], workspace: { hiddenSidebarSections: [] } },
        });
        expect(systemStatusSelectors.hiddenSidebarSections('ws-1')(s)).toEqual([]);
      });
    });

    describe('routeOverlayWrites', () => {
      it('passes patch through unchanged when workspaceId is null', () => {
        const patch = { hiddenSidebarSections: ['recents'], leftPanelWidth: 300 };
        expect(routeOverlayWrites(patch, null)).toBe(patch);
      });

      it('routes whitelisted fields into the workspace overlay', () => {
        const patch = { hiddenSidebarSections: ['recents'], expandSessionGroupKeys: ['x'] };
        expect(routeOverlayWrites(patch, 'ws-1')).toEqual({
          workspace: {
            hiddenSidebarSections: ['recents'],
            expandSessionGroupKeys: ['x'],
          },
        });
      });

      it('keeps non-whitelisted fields at the top level even in workspace mode', () => {
        const patch = { leftPanelWidth: 300, language: 'zh-CN' as const };
        expect(routeOverlayWrites(patch, 'ws-1')).toEqual({
          leftPanelWidth: 300,
          language: 'zh-CN',
        });
      });

      it('splits a mixed patch into top-level and workspace overlay', () => {
        const patch = {
          leftPanelWidth: 300,
          hiddenSidebarSections: ['recents'],
          sidebarItems: ['agent'],
        };
        expect(routeOverlayWrites(patch, 'ws-1')).toEqual({
          leftPanelWidth: 300,
          workspace: {
            hiddenSidebarSections: ['recents'],
            sidebarItems: ['agent'],
          },
        });
      });

      it('preserves an explicit `workspace` key while routing whitelisted fields', () => {
        const patch = {
          hiddenSidebarSections: ['recents'],
          workspace: { sidebarItems: ['existing'] as string[] },
        };
        expect(routeOverlayWrites(patch, 'ws-1')).toEqual({
          workspace: {
            sidebarItems: ['existing'],
            hiddenSidebarSections: ['recents'],
          },
        });
      });
    });
  });

  describe('homeGoalsCollapsed', () => {
    // The goals card opens by default: a first-time viewer must see the goals,
    // not an unexplained folded header.
    it('reads as open when the viewer has never folded the card', () => {
      const s: GlobalState = merge(initialState, { status: {} });

      expect(systemStatusSelectors.homeGoalsCollapsed(s)).toBe(false);
    });

    it('keeps the card folded once the viewer put it away', () => {
      const s: GlobalState = merge(initialState, { status: { homeGoalsCollapsed: true } });

      expect(systemStatusSelectors.homeGoalsCollapsed(s)).toBe(true);
    });
  });
});
