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
    // The whole Labs page is gone (see below), so no toggle can exist.
    expect(exists('src/features/Settings/labs'), 'the Labs page is back').toBe(false);
  });

  // The sidebar check lives in the shared describe below — it covers every
  // retired tab on both shells, so it is not repeated here.
});

describe('the Labs settings page stays retired', () => {
  // Every flag it exposed defaulted on, so the page only offered a way to turn
  // core features off. The features ship unconditionally now.
  it('ships neither the page nor its flag catalog nor its workspace route', () => {
    expect(exists('src/features/Settings/labs'), 'the Labs page is back').toBe(false);
    expect(
      exists('src/routes/(main)/[workspaceSlug]/settings/labs'),
      'the workspace Labs route is back',
    ).toBe(false);
  });

  it('leaves no LAB_FEATURES catalog or lab selector wiring behind', () => {
    expect(exists('src/store/user/slices/preference/selectors/labPrefer.ts')).toBe(false);
    expect(read('src/store/user/selectors.ts')).not.toContain('labPreferSelectors');
    expect(read('src/features/SettingsSearch/items.ts')).not.toContain('LAB_FEATURES');
  });

  it('ships no labs locale namespace', () => {
    expect(exists('packages/locales/src/default/labs.ts'), 'the labs namespace is back').toBe(
      false,
    );
    expect(read('packages/locales/src/default/index.ts')).not.toMatch(/\blabs\b/);
  });

  it('answers /settings/labs with a redirect to Advanced', () => {
    expect(read('packages/app-config/src/routes/settings.ts')).toContain(
      `[SettingsTabs.Labs]: { aliasOf: SettingsTabs.Advanced, status: 'retired' }`,
    );
  });

  it('keeps labs out of the workspace-aware settings tab allowlist', () => {
    expect(read('src/features/Workspace/workspaceAwarePath.ts')).not.toContain(`'labs'`);
  });
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

describe('the Agent labels and Security settings pages stay retired', () => {
  it('ships neither page, nor the workspace labels mirror', () => {
    for (const retired of [
      'src/features/Settings/labels',
      'src/features/Settings/security',
      'src/features/WorkspaceSetting/Labels',
      'src/routes/(main)/[workspaceSlug]/settings/labels',
    ]) {
      expect(exists(retired), `${retired} is back`).toBe(false);
    }
  });

  it('registers neither page in either component map', () => {
    for (const file of [
      'src/features/Settings/features/componentMap.ts',
      'src/features/Settings/features/componentMap.desktop.ts',
    ]) {
      const source = read(file);

      expect(source, `${file} still maps Labels`).not.toContain('SettingsTabs.Labels');
      expect(source, `${file} still maps Security`).not.toContain('SettingsTabs.Security');
    }
  });

  it('keeps the workspace labels route and tab out of the workspace shell', () => {
    expect(read('src/spa/router/sharedMainAreaLeaves.tsx')).not.toContain('settings/labels');
    expect(read('src/types/workspaceSettings.ts')).not.toContain(`'labels'`);
    expect(read('src/features/Workspace/workspaceAwarePath.ts')).not.toContain(`'labels'`);
  });

  it('keeps the agent label client store, service and fetch hook gone', () => {
    for (const retired of [
      'src/store/home/slices/label',
      'src/services/agentLabel',
      'src/hooks/useFetchAgentLabels.ts',
      'src/features/AgentViewAll/LabelTags.tsx',
    ]) {
      expect(exists(retired), `${retired} is back`).toBe(false);
    }
  });

  it('lets the old URLs redirect to the settings root instead of rendering', () => {
    const registry = read('packages/app-config/src/routes/settings.ts');

    expect(registry).toMatch(
      /\[SettingsTabs\.Labels\]: \{ aliasOf: SettingsTabs\.Profile, status: 'retired' \}/,
    );
    expect(registry).toMatch(
      /\[SettingsTabs\.Security\]: \{ aliasOf: SettingsTabs\.Profile, status: 'retired' \}/,
    );
    expect(registry).toContain(`{ alias: 'labels', target: 'root' }`);
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
  const RETIRED_TABS = ['Labels', 'Labs', 'OAuthApps', 'Referral', 'Security', 'Skill'] as const;

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
    // `WorkspaceSettingsTabs.<tab>`, so this one pattern covers both enums in
    // the single desktop sidebar.
    for (const file of [
      'src/features/Settings/hooks/useCategory.tsx',
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
      'src/features/Projects/Layout/TabsBar.tsx',
      'src/features/Projects/Workspace/ProjectDashboard.tsx',
    ]) {
      for (const retired of retiredPaths) {
        expect(read(file), `${file} still wires up ${retired}`).not.toContain(retired);
      }
    }
  });
});

describe('controls removed because nothing read them (2026/10/09) stay removed', () => {
  it('keeps the dead system-agent rows out of the Service model form and its selectors', () => {
    const form = read('src/features/ServiceModel/ModelAssignmentsForm.tsx');
    const selectors = read('src/store/user/slices/settings/selectors/systemAgent.ts');

    for (const key of ['promptRewrite', 'generationTopic', 'historyCompress']) {
      expect(form, `the Service model form lists ${key} again`).not.toContain(key);
      expect(selectors, `systemAgentSelectors exposes ${key} again`).not.toContain(key);
    }
  });

  it('keeps the uncalled history-summary action and the rows copy gone', () => {
    expect(
      exists('src/store/chat/slices/agentRun/actions/state/memory.ts'),
      'the dead internal_summaryHistory action is back',
    ).toBe(false);
    expect(read('src/store/chat/slices/agentRun/actions/index.ts')).not.toContain('Memory');

    const locale = read('packages/locales/src/default/setting.ts');
    for (const key of ['promptRewrite', 'generationTopic', 'historyCompress']) {
      expect(locale, `the default locale carries systemAgent.${key} again`).not.toContain(key);
    }
  });

  it('keeps the 404 Blog, Terms and Privacy links off the About page', () => {
    const about = read('src/features/Settings/about/features/About.tsx');

    for (const retired of ['BLOG', 'TERMS_URL', 'PRIVACY_URL']) {
      expect(about, `About links ${retired} again`).not.toContain(retired);
    }
  });

  it('ships no orphaned workspace Linear sync page, but keeps its bookmark redirect', () => {
    expect(exists('src/features/WorkspaceSetting/Linear'), 'the old sync page is back').toBe(false);
    expect(
      exists('src/routes/(main)/[workspaceSlug]/settings/linear'),
      'the old sync route stub is back',
    ).toBe(false);
    expect(read('src/spa/router/sharedMainAreaLeaves.tsx')).toContain(
      `redirectElement('../imports/linear'), path: 'linear'`,
    );
  });
});

describe('the chat-era service-model features (2026/10/09) stay retired', () => {
  // Same shape as above: the failure mode is a file or a registration coming
  // back through a rebase, so these read the repository rather than run it.
  it('ships no text-to-speech synthesis, hook or message player', () => {
    // The route file stays as a 410 answer for clients released before the
    // retirement; it must not synthesize speech again.
    expect(
      read('src/app/(backend)/webapi/tts/openai/route.ts'),
      'the TTS route synthesizes speech again',
    ).not.toContain('@lobehub/tts');
    expect(exists('src/hooks/useTTS.ts'), 'the TTS hook is back').toBe(false);
    expect(exists('src/features/Settings/tts'), 'the TTS settings block is back').toBe(false);
    expect(
      exists('src/features/Conversation/Messages/components/Extras/TTS'),
      'the message TTS player is back',
    ).toBe(false);
  });

  it('registers no translate or tts message action', () => {
    const actions = 'src/features/Conversation/Messages/components/MessageActionBar';

    expect(exists(`${actions}/actions/translate.ts`), 'the translate action is back').toBe(false);
    expect(exists(`${actions}/actions/tts.ts`), 'the tts action is back').toBe(false);
    expect(exists('src/store/chat/slices/translate'), 'the translate slice is back').toBe(false);

    const registry = read(`${actions}/useBuildActions.ts`);
    expect(registry).not.toContain('translateAction');
    expect(registry).not.toContain('ttsAction');
  });

  it('keeps the AI Suggestions footer and the follow-up chips out of the chat surfaces', () => {
    expect(exists('src/features/AIChatbot/Suggestions.tsx'), 'the Suggestions footer is back').toBe(
      false,
    );
    expect(read('src/features/AIChatbot/Page.tsx')).not.toContain('Suggestions');
    expect(
      exists('src/features/Conversation/hooks/useChatFollowUp.ts'),
      'the follow-up hook is back',
    ).toBe(false);
    expect(
      exists('src/features/Conversation/FollowUp'),
      'the follow-up chips renderer is back',
    ).toBe(false);
  });

  it('offers no service-model row for the retired chat-era features', () => {
    const form = read('src/features/ServiceModel/ModelAssignmentsForm.tsx');

    for (const key of [
      'translation',
      'agentMeta',
      'topicAutoSummary',
      'followUpAction',
      'inputCompletion',
    ]) {
      expect(form, `ModelAssignmentsForm still lists ${key}`).not.toContain(`{ key: '${key}' }`);
    }
  });

  it('keeps the opening message and questions out of the agent settings page', () => {
    expect(
      exists('src/features/AgentSettings/AgentOpeningSettings.tsx'),
      'the opening settings section is back',
    ).toBe(false);
    expect(read('src/features/Settings/agents/AgentSettingsDetailPage.tsx')).not.toContain(
      'AgentOpeningSettings',
    );
  });
});

describe('the topic auto-naming service-model row stays retired', () => {
  // A topic is named by the agent that owns the conversation, so there is no
  // separate "naming agent" to configure. The persisted `systemAgent.topic`
  // field stays on the server (taskReview still reads it); only the client
  // surface is gone.
  it('keeps the row, its selector and its locale keys out of the client', () => {
    expect(read('src/features/ServiceModel/ModelAssignmentsForm.tsx')).not.toContain(
      `{ key: 'topic' }`,
    );
    expect(read('src/store/user/slices/settings/selectors/systemAgent.ts')).not.toMatch(
      /currentSystemAgent\(s\)\.topic\b|^\s+topic,$/m,
    );

    for (const file of [
      'packages/locales/src/default/setting.ts',
      'locales/en-US/setting.json',
      'locales/zh-CN/setting.json',
    ]) {
      expect(read(file), `${file} still carries the topic naming copy`).not.toMatch(
        /systemAgent\.topic\.(label|modelDesc|title)/,
      );
    }
  });

  it('keeps settings search from pointing at topic naming', () => {
    expect(read('src/features/SettingsSearch/items.ts')).not.toContain('topic naming');
  });

  it('does not read the retired model when naming a topic', () => {
    expect(read('src/store/chat/slices/topic/action.ts')).not.toContain(
      'systemAgentSelectors.topic',
    );
  });
});
