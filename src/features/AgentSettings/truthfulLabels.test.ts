import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import defaultSetting from '../../../packages/locales/src/default/setting';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const read = (relativePath: string) => readFileSync(path.join(repoRoot, relativePath), 'utf8');
const locale = (name: 'en-US' | 'zh-CN') =>
  JSON.parse(read(`locales/${name}/setting.json`)) as Record<string, string>;

describe('agent settings labels name what the control does', () => {
  it('labels the read-only runtime row "Runtime"', () => {
    expect(defaultSetting['settingAgent.generalSettings.agentLabel']).toBe('Runtime');
    expect(locale('en-US')['settingAgent.generalSettings.agentLabel']).toBe('Runtime');
    expect(locale('zh-CN')['settingAgent.generalSettings.agentLabel']).toBe('运行时');
    // The duplicate, never-rendered key must not come back.
    expect('settingAgent.generalSettings.legacyLabel' in defaultSetting).toBe(false);
  });

  it('labels the selection policies by who may switch, not by the thing switched', () => {
    expect(locale('en-US')['settingAgent.modelPolicy.title']).toBe('Member model switching');
    expect(locale('en-US')['settingAgent.devicePolicy.title']).toBe('Member device switching');
    expect(locale('zh-CN')['settingAgent.modelPolicy.title']).toBe('成员切换模型');
    expect(locale('zh-CN')['settingAgent.devicePolicy.title']).toBe('成员切换设备');
  });

  it('renders the diagnostics link without an "Advanced" fold', () => {
    const page = read('src/features/Settings/agents/AgentSettingsDetailPage.tsx');

    expect(page).not.toContain('advancedSettings.title');
    expect(page).toContain('<AgentAdvancedSettings');
    expect('settingAgent.advancedSettings.title' in defaultSetting).toBe(false);
    expect(locale('en-US')).not.toHaveProperty(['settingAgent.advancedSettings.title']);
    expect(locale('zh-CN')).not.toHaveProperty(['settingAgent.advancedSettings.title']);
  });
});

describe('service model "goal" row says everything it drives', () => {
  it('is titled for planning and acceptance and carries a description', () => {
    expect(defaultSetting['systemAgent.goal.title']).toBe('Planning & acceptance');
    expect(locale('en-US')['systemAgent.goal.title']).toBe('Planning & acceptance');
    expect(locale('zh-CN')['systemAgent.goal.title']).toBe('规划与验收');
    // The row is a fallback, not the model these flows normally run on.
    expect(locale('en-US')['systemAgent.goal.modelDesc']).toMatch(/last fallback/i);
    expect(read('src/features/ServiceModel/ModelAssignmentsForm.tsx')).toContain(
      "t('systemAgent.goal.modelDesc')",
    );
  });
});

describe('the Orchestrator page names only what consumes it', () => {
  it('mentions projects, not groups', () => {
    for (const name of ['en-US', 'zh-CN'] as const) {
      const strings = locale(name);
      for (const key of [
        'orchestrator.description',
        'orchestrator.personalScope',
        'orchestrator.unsupported',
        'orchestrator.workspaceScope',
      ]) {
        expect(strings[key]).not.toMatch(/groups|群组/);
        expect(strings[key]).toMatch(/projects|项目/);
      }
    }
  });
});
