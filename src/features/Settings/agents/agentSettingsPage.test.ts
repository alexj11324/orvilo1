/**
 * @vitest-environment node
 *
 * Structural gate for the native `/settings/agents/:id` page and the
 * minimalism sweep around it.
 *
 * The page itself is TSX and this repo does not add `.test.tsx` files, so the
 * enforceable contract is the *shape of the repository*: which modules the
 * page mounts, which files exist, and which vocabulary the shipped locales
 * still carry. Behavioural halves live in their own resolvers' tests
 * (`buildServerDefaultModelOptions` for the humanised model labels below,
 * `agentDeviceSettingsState` for the device picker matrix).
 */
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { DEFAULT_AGENT_CONFIG } from '@orvilo/const';
import { describe, expect, it, vi } from 'vitest';

import { shouldShowAgentBreadcrumb } from '@/features/AgentBreadcrumb/shouldShowAgentBreadcrumb';
import { buildServerDefaultModelOptions } from '@/features/HeterogeneousAgent/modelPicker';
import { isFullAgentConfig } from '@/services/agent';

import { agentSettingsRowState } from './agentSettingsRowState';

vi.mock('@/libs/trpc/client', () => ({ lambdaClient: {} }));

const repoRoot = path.resolve(import.meta.dirname, '../../../..');

const exists = (relativePath: string) =>
  lstatSync(path.join(repoRoot, relativePath), { throwIfNoEntry: false }) !== undefined;

const read = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8');

const SETTINGS_SURFACE_FILES = [
  'src/features/Settings/agents/index.tsx',
  'src/features/Settings/agents/AgentSettingsDetailPage.tsx',
  'src/features/Settings/agents/AgentSettingsHeader.tsx',
  'src/features/AgentSettings/AgentAccessSettings.tsx',
  'src/features/AgentSettings/AgentAdvancedSettings.tsx',
  'src/features/AgentSettings/AgentDeviceSettings.tsx',
  'src/features/AgentSettings/AgentModelSettings.tsx',
  'src/features/AgentSettings/ExternalAgentConnectionSettings.tsx',
  'src/features/AgentSettings/SettingsGroup.tsx',
];

describe('the native agent settings page carries no profile chrome', () => {
  it('mounts AgentSettingsDetailPage instead of the profile embed', () => {
    const index = read('src/features/Settings/agents/index.tsx');

    expect(index).toContain('AgentSettingsDetailPage');
    expect(index).not.toMatch(/import AgentProfile/);
    expect(index).not.toContain('<AgentProfile');
  });

  it('imports none of the retired profile chrome or management sections', () => {
    const page = read('src/features/Settings/agents/AgentSettingsDetailPage.tsx');

    for (const banned of [
      'AgentProfile',
      'AgentBreadcrumb',
      'ProfileArea',
      'AgentBuilder',
      'ProfileTabs',
      'AgentToolsSection',
      'UserToolsSection',
      'RunPriorityHint',
      'AgentSkill',
      'PluginTag',
    ]) {
      expect(page, `AgentSettingsDetailPage imports ${banned}`).not.toContain(banned);
    }
  });

  it('keeps the retired tool/skill management surface deleted', () => {
    expect(exists('src/features/ProfileEditor/AgentUserTools'), 'AgentUserTools is back').toBe(
      false,
    );
    // The shared AgentTool component must NOT be deleted — group MemberProfile
    // still mounts it. Assert the settings surface never re-imports it.
    for (const file of SETTINGS_SURFACE_FILES) {
      expect(read(file), `${file} re-mounts tool management`).not.toContain('AgentUserTools');
      expect(read(file), `${file} re-mounts tool management`).not.toContain('ProfileEditor');
    }
  });

  it('renders no breadcrumb element anywhere under /settings', () => {
    // Zero-breadcrumb is a hard requirement on the settings surface — the page
    // mounts no AgentBreadcrumb (asserted above) and the chat-side gate agrees.
    expect(shouldShowAgentBreadcrumb('/settings/agents/agt_x')).toBe(false);
    expect(shouldShowAgentBreadcrumb('/ws-1/settings/agents/agt_x')).toBe(false);
    expect(shouldShowAgentBreadcrumb('/agent/agt_x')).toBe(true);
  });
});

describe('retired vocabulary stays out of the user-facing surface', () => {
  it('drops the retired terminology keys from the default locale sources', () => {
    const setting = read('packages/locales/src/default/setting.ts');
    const chat = read('packages/locales/src/default/chat.ts');

    // `agentTools.*`/`userTools.*`/`runtimeConfig.*` stay — AgentSkillStore,
    // PluginTag and ReasoningEffortSelect still consume them on non-settings
    // surfaces. Only the retired keys + retired vocabulary are asserted gone.
    for (const banned of [
      'agentEngine.',
      'runtimeEnv.',
      "'toolsConfig.title'",
      'devicePolicy.noPublicDevice',
      'Execution Environment',
      // 'Cloud Sandbox' stays — `heteroAgent.executionTarget.sandbox` and the
      // orvilo-cloud-sandbox builtin tool are real hetero vocabulary.
    ]) {
      expect(`${setting}\n${chat}`).not.toContain(banned);
    }
    // The installed-agent picker has live localHarness.* keys. Keep its
    // human-facing label while excluding the retired settings keys above.
    expect(chat).toContain("'localHarness.title': 'Installed on this device'");
  });

  it('keeps no retired-key references in the settings surface', () => {
    for (const file of SETTINGS_SURFACE_FILES) {
      const source = read(file);

      for (const banned of ['agentEngine.', 'runtimeEnv.', 'toolsConfig.', 'agentTools.']) {
        expect(source, `${file} still references ${banned}* keys`).not.toContain(banned);
      }
    }
  });

  it('labels the execution-target switcher as Device', () => {
    expect(read('packages/locales/src/default/chat.ts')).toContain(
      "'heteroAgent.executionTarget.title': 'Device'",
    );
    expect(read('packages/locales/src/default/setting.ts')).toContain(
      "'settingAgent.executionSettings.title': 'Execution'",
    );
  });
});

describe('human-readable model labels', () => {
  const builtinAiModelList = [
    { displayName: 'DeepSeek V4 Flash', id: 'deepseek-v4-flash', providerId: 'orvilo' },
  ] as never;

  it('maps a raw binding route to its model-bank display name', () => {
    const options = buildServerDefaultModelOptions(
      [{ model: 'deepseek-v4-flash' }],
      builtinAiModelList,
    );

    expect(options).toHaveLength(1);
    expect(options[0].value).toBe('deepseek-v4-flash');
    // `title` is what the closed trigger renders — it must be the friendly
    // name, never the raw `binding.model` route.
    expect(options[0].title).toBe('DeepSeek V4 Flash');
  });

  it('falls back to the raw route when no catalog metadata exists', () => {
    const options = buildServerDefaultModelOptions([{ model: 'unknown-route' }], []);

    expect(options[0].title).toBe('unknown-route');
  });
});

describe('sidebar + topic-row chrome stays de-attributed', () => {
  it('keeps a workspace-aware Issues destination without restoring an agent breadcrumb', () => {
    const header = read('src/features/AgentSidebar/Header/index.tsx');
    const nav = read('src/features/AgentSidebar/Header/Nav.tsx');

    expect(header).toContain('<Nav />');
    expect(nav).toContain("buildWorkspaceAwarePath('/tasks', activeSlug)");
    expect(nav).toContain('href={issuesHref}');
    expect(nav).toContain('icon={ListTodoIcon}');
    expect(nav).toContain("title={t('common:tab.issues')}");
    expect(`${header}\n${nav}`).not.toContain('AgentBreadcrumb');
    expect(`${header}\n${nav}`).not.toContain('agentSelectors');
    expect(`${header}\n${nav}`).not.toContain('HomeIcon');
  });

  it('carries no bound-agent node on topic list rows', () => {
    for (const file of [
      'src/features/AgentSidebar/Topic/List/Item/index.tsx',
      'src/features/MobileHome/TopicListContent/TopicRow.tsx',
    ]) {
      const source = read(file);
      expect(source, `${file} still attributes the row to an agent`).not.toContain(
        'boundAgentName',
      );
      expect(source, `${file} still attributes the row to an agent`).not.toContain(
        'boundAgentNode',
      );
    }
  });
});

describe('settings Agent row profile loading boundary', () => {
  const input = {
    agencyConfig: undefined,
    devices: [],
    bindings: [],
    desktop: true,
    workspaceScoped: false,
    loading: false,
  };
  it('keeps a cached safe profile out of config hydration and marks configuration unavailable', () => {
    const cachedProfile = {
      ...DEFAULT_AGENT_CONFIG,
      id: 'agent-1',
      title: 'Issue executor',
      visibility: 'private' as const,
      workspaceId: 'workspace-1',
      agencyConfig: { heterogeneousProvider: { type: 'claude-code' as const } },
    };
    for (const field of ['params', 'systemRole', 'tts', 'plugins', 'chatConfig'])
      Reflect.deleteProperty(cachedProfile, field);
    const hydrated: unknown[] = [];
    if (isFullAgentConfig(cachedProfile)) hydrated.push(cachedProfile);
    const config = isFullAgentConfig(cachedProfile) ? cachedProfile : null;

    expect(hydrated).toEqual([]);
    expect(agentSettingsRowState({ ...input, profile: config }).state).toBe('unavailable');
    expect(cachedProfile.title).toBe('Issue executor');
    expect(cachedProfile.agencyConfig.heterogeneousProvider.type).toBe('claude-code');
  });
  it('retains unresolved, absent and failed profile states without reading an absent config', () => {
    expect(agentSettingsRowState({ ...input, profile: undefined }).state).toBe('loading');
    expect(agentSettingsRowState({ ...input, profile: null }).state).toBe('unavailable');
    expect(
      agentSettingsRowState({ ...input, profile: undefined, error: new Error('offline') }).state,
    ).toBe('error');
  });
});
