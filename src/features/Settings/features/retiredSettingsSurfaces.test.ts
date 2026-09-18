/**
 * @vitest-environment node
 *
 * Structural gate for the settings surfaces retired in this wave.
 *
 * These are the anti-resurrection half of the retirement: the behavioural tests
 * (router resolution, sidebar groups, lab toggles) prove the product is honest
 * today, but nothing there stops a later rebase or cherry-pick from quietly
 * re-registering a page the product no longer ships. This file asserts on the
 * *shape of the repository* instead, which is why it reads wiring files as text.
 *
 * See `docs/development/hidden-surface-retirement.md` (HS-50 / HS-52).
 */
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { LAB_FEATURES } from '../labs/features';

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

const exists = (relativePath: string) =>
  lstatSync(path.join(repoRoot, relativePath), { throwIfNoEntry: false }) !== undefined;

const read = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

describe('the self-built OAuth app console (HS-50) stays retired', () => {
  it('ships neither the console page nor its workspace route', () => {
    expect(exists('src/features/Settings/oauth-apps'), 'the console feature is back').toBe(false);
    expect(
      exists('src/routes/(main)/[workspaceSlug]/settings/oauth-apps'),
      'the workspace console route is back',
    ).toBe(false);
  });

  it('registers the workspace path on neither router', () => {
    // The desktop tree and the mobile tree spell their tab lists out separately,
    // which is how one of them used to survive a deletion of the other.
    for (const file of [
      'src/spa/router/desktopRouter.shared.tsx',
      'src/spa/router/mobileRouter.config.tsx',
    ]) {
      expect(read(file), `${file} still registers the console`).not.toContain(
        'settings/oauth-apps',
      );
    }
  });

  it('keeps the workspace settings tab list free of the retired mirror', () => {
    // `WORKSPACE_SETTINGS_TABS` is the allowlist that prefixes `/settings/<tab>`
    // with the active workspace slug; a stale entry would send the deep link to a
    // workspace route that no longer exists.
    expect(read('src/features/Workspace/workspaceAwarePath.ts')).not.toContain(`'oauth-apps'`);
  });

  it('offers no lab toggle that could switch the console back on', () => {
    expect(LAB_FEATURES.map((feature) => feature.flag)).not.toContain('enableOAuthApps');
  });

  // The sidebar check lives in the shared describe below — it covers every
  // retired tab on both shells, so it is not repeated here.
});

describe('the Referral shell settings page (HS-52) stays retired', () => {
  it('ships no page for a registry slot to render', () => {
    expect(
      exists('src/business/client/BusinessSettingPages/Referral.tsx'),
      'the empty Referral page is back',
    ).toBe(false);
  });

  it('keeps the referral capability itself', () => {
    // Only the empty settings page was retired. The recommendation capability
    // rides on its own provider and is not part of this decision.
    expect(exists('src/business/client/ReferralProvider.tsx')).toBe(true);
  });

  it('leaves the deployment-owned business slots alone', () => {
    // Plans / Credits / Billing / Usage are `NEEDS_TRACE`: they are empty in the
    // open-source tree but are the injection point for a private deployment's
    // business overlay, so retiring them is not a local decision.
    for (const page of ['Billing', 'Credits', 'Plans', 'Usage']) {
      expect(
        exists(`src/business/client/BusinessSettingPages/${page}.tsx`),
        `${page} was removed with the Referral page`,
      ).toBe(true);
    }
  });
});

describe('a retired settings tab leaves no way to reach it', () => {
  // Deleting the page is the easy half. Every *entry point* into it ships its
  // own wiring, and each one survived the first pass independently: the search
  // index kept its keywords, the command palette kept its destination, and the
  // sidebar footer kept its link. A user could still click straight into a
  // not-found — which is precisely what "retired" is supposed to prevent.
  //
  // These assert on the wiring files as text, because the failure mode is a
  // *registration* coming back, not a behaviour changing.
  const RETIRED_TABS = ['OAuthApps', 'Referral', 'Skill'] as const;

  it('keeps no search-index wiring for a retired tab', () => {
    const items = read('src/features/SettingsSearch/items.ts');

    for (const tab of RETIRED_TABS) {
      expect(items, `SettingsTabs.${tab} still has search-index wiring`).not.toContain(
        `SettingsTabs.${tab}`,
      );
    }
  });

  it('keeps every retired tab out of every settings sidebar, on both shells', () => {
    // The desktop and mobile trees spell their tab lists out separately, which
    // is how the mobile Referral row outlived the page: it was listed *inside*
    // the Plans gate rather than behind its own, so retiring the page left the
    // row pointing at a not-found. `SettingsTabs.<tab>` is also a substring of
    // `WorkspaceSettingsTabs.<tab>`, so this one pattern covers both enums.
    for (const file of [
      'src/features/Settings/hooks/useCategory.tsx',
      'src/features/WorkspaceSetting/hooks/useCategory.tsx',
      'src/routes/(mobile)/me/settings/features/useCategory.tsx',
      'src/routes/(mobile)/settings/_layout/Header.tsx',
    ]) {
      const source = read(file);

      for (const tab of RETIRED_TABS) {
        expect(source, `${file} still lists SettingsTabs.${tab}`).not.toContain(
          `SettingsTabs.${tab}`,
        );
      }
    }
  });

  it('keeps no palette entry, footer link or path builder for a retired page', () => {
    const retiredPaths = ['/settings/referral', 'projectAcceptancePath'];

    for (const file of [
      'src/features/CommandMenu/utils/contextCommands.ts',
      'src/features/HomeSidebar/Footer/index.tsx',
      'src/features/Projects/Layout/navigation.ts',
      'src/features/Projects/Layout/Sidebar.tsx',
      'src/features/Projects/Workspace/ProjectDashboard.tsx',
    ]) {
      for (const retired of retiredPaths) {
        expect(read(file), `${file} still wires up ${retired}`).not.toContain(retired);
      }
    }
  });
});
