import { describe, expect, it } from 'vitest';

import { ChatSettingsTabs } from '@/store/global/initialState';

import { resolveActiveTab } from './resolveActiveTab';

const items = [{ key: ChatSettingsTabs.Opening }, { key: ChatSettingsTabs.Connector }];

describe('resolveActiveTab', () => {
  it('defaults to the first offered tab', () => {
    expect(resolveActiveTab(items, undefined)).toBe(ChatSettingsTabs.Opening);
  });

  it('keeps the selected tab while it is offered', () => {
    expect(resolveActiveTab(items, ChatSettingsTabs.Connector)).toBe(ChatSettingsTabs.Connector);
  });

  it('falls back when the selected tab is no longer offered', () => {
    expect(resolveActiveTab(items, ChatSettingsTabs.Rules)).toBe(ChatSettingsTabs.Opening);
  });

  it('returns undefined when nothing is offered', () => {
    expect(resolveActiveTab([], ChatSettingsTabs.Opening)).toBeUndefined();
    expect(resolveActiveTab(undefined, undefined)).toBeUndefined();
  });
});
