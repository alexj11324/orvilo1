import { describe, expect, it } from 'vitest';

import setting from '@/locales/default/setting';

describe('settings copy', () => {
  it('labels the dev-mode switch as Developer mode and names what it reveals', () => {
    expect(setting['settingCommon.devMode.title']).toBe('Developer mode');
    expect(setting['settingCommon.devMode.desc']).toContain('API Key page');
  });

  it('scopes Gateway mode to the built-in agent', () => {
    expect(setting['tab.advanced.gatewayMode.desc']).toContain('built-in agent only');
  });

  it('uses non-repeating Advanced page group titles', () => {
    expect(setting['tab.advanced.toolsAndDiagnostics.title']).toBe('Tools and diagnostics');
    expect(setting['tab.advanced.appUpdates.title']).toBe('App updates');
    expect(setting['tab.advanced.updateChannel.title']).toBe('Update channel');
  });
});
