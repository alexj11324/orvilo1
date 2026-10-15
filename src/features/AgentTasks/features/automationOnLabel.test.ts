import { describe, expect, it } from 'vitest';

import enAutomation from '../../../../locales/en-US/automation.json';
import enChat from '../../../../locales/en-US/chat.json';
import enCommon from '../../../../locales/en-US/common.json';
import zhAutomation from '../../../../locales/zh-CN/automation.json';
import zhChat from '../../../../locales/zh-CN/chat.json';
import zhCommon from '../../../../locales/zh-CN/common.json';
import automation from '../../../../packages/locales/src/default/automation';
import chat from '../../../../packages/locales/src/default/chat';
import common from '../../../../packages/locales/src/default/common';
import { STATUS_META } from './taskStatusMeta';

const text = (record: Record<string, string>, key: string) => record[key];

describe('armed periodic Issue label', () => {
  it('keeps the board on Automation on while a round runs', () => {
    expect(text(chat, 'taskDetail.status.scheduled')).toBe('Automation on');
    expect(text(chat, 'taskList.kanban.scheduled')).toBe('Automation on');
    expect(text(common, 'savedViews.values.status.scheduled')).toBe('Automation on');
    expect(text(automation, 'status.active')).toBe('Automation on');
    expect(text(enChat, 'taskDetail.status.scheduled')).toBe('Automation on');
    expect(text(enChat, 'taskList.kanban.scheduled')).toBe('Automation on');
    expect(text(enCommon, 'savedViews.values.status.scheduled')).toBe('Automation on');
    expect(text(enAutomation, 'status.active')).toBe('Automation on');
    expect(text(zhChat, 'taskDetail.status.scheduled')).toBe('自动化已启用');
    expect(text(zhChat, 'taskList.kanban.scheduled')).toBe('自动化已启用');
    expect(text(zhCommon, 'savedViews.values.status.scheduled')).toBe('自动化已启用');
    expect(text(zhAutomation, 'status.active')).toBe('自动化已启用');
    expect(STATUS_META.scheduled.label).toBe('Automation on');
  });
});
