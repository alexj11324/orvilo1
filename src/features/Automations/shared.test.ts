import type { TaskDetailData, TaskListItem } from '@orvilo/types';
import i18next from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  automationDetailTriggerSummary,
  automationStatusesFor,
  automationTriggerSummary,
  resolveAutomationScope,
  resolveAutomationStatusFilter,
} from './shared';

// Real i18next instance mirroring the app config (keySeparator: false): the
// 'automation' namespace intentionally lacks taskSchedule.* keys — they live in
// 'chat'. The bug this guards: callers bound only to 'automation' rendered raw
// keys like `taskSchedule.summary.daily` in the trigger summaries.
const i18n = i18next.createInstance();

beforeAll(async () => {
  await i18n.init({
    keySeparator: false,
    lng: 'en',
    nsSeparator: ':',
    resources: {
      en: {
        automation: { 'trigger.every': 'Every {{interval}}' },
        chat: {
          'taskSchedule.summary.daily': 'Daily at {{time}}',
          'taskSchedule.unit.hour_one': '{{count}} hr',
          'taskSchedule.unit.hour_other': '{{count}} hrs',
        },
      },
    },
  });
});

const scheduledTask = {
  automationMode: 'schedule',
  schedulePattern: '0 9 * * *',
  status: 'scheduled',
} as TaskListItem;

const heartbeatTask = {
  automationMode: 'heartbeat',
  heartbeatInterval: 3600,
  status: 'scheduled',
} as TaskListItem;

const scheduledDetail = {
  automationMode: 'schedule',
  schedule: { pattern: '0 9 * * *', timezone: 'Asia/Shanghai' },
  status: 'scheduled',
} as unknown as TaskDetailData;

describe('automationTriggerSummary', () => {
  it('resolves schedule summaries with an automation-only t (the caller shape)', () => {
    const t = i18n.getFixedT('en', 'automation');
    expect(automationTriggerSummary(scheduledTask, t)).toBe('Daily at 09:00');
  });

  it('resolves heartbeat summaries through both namespaces', () => {
    const t = i18n.getFixedT('en', 'automation');
    expect(automationTriggerSummary(heartbeatTask, t)).toBe('Every 1 hr');
  });
});

describe('automationDetailTriggerSummary', () => {
  it('resolves detail schedule summaries with an automation-only t', () => {
    const t = i18n.getFixedT('en', 'automation');
    expect(automationDetailTriggerSummary(scheduledDetail, t)).toBe('Daily at 09:00');
  });
});

describe('resolveAutomationScope', () => {
  it('opens the workspace-wide roll-up when nothing narrows it', () => {
    expect(resolveAutomationScope(new URLSearchParams())).toBe('all');
    expect(resolveAutomationScope(new URLSearchParams('scope=all'))).toBe('all');
  });

  it('opens the created-only roll-up from its addressable URL', () => {
    expect(resolveAutomationScope(new URLSearchParams('scope=created'))).toBe('created');
  });

  it('ignores "My tasks"’ own scope value', () => {
    // `scope` is shared with the member-scoped "My tasks" tab, whose default is
    // `assigned`. Reading that as "created" would silently narrow the roll-up
    // to the caller's automations the moment the two tabs were adjacent.
    expect(resolveAutomationScope(new URLSearchParams('scope=assigned'))).toBe('all');
    expect(resolveAutomationScope(new URLSearchParams('scope=unknown'))).toBe('all');
  });
});

describe('resolveAutomationStatusFilter', () => {
  it('offers every status when nothing narrows it', () => {
    expect(resolveAutomationStatusFilter(new URLSearchParams())).toBe('all');
    expect(resolveAutomationStatusFilter(new URLSearchParams('status=all'))).toBe('all');
  });

  it('opens each narrowing from its addressable URL', () => {
    expect(resolveAutomationStatusFilter(new URLSearchParams('status=active'))).toBe('active');
    expect(resolveAutomationStatusFilter(new URLSearchParams('status=paused'))).toBe('paused');
  });

  it('falls back to every status for an unknown value', () => {
    expect(resolveAutomationStatusFilter(new URLSearchParams('status=running'))).toBe('all');
  });
});

describe('automationStatusesFor', () => {
  it('narrows "active" to the statuses a schedule can still fire from', () => {
    // `paused` is the only user-visible off state; everything else is active.
    expect(automationStatusesFor('active')).toEqual(['backlog', 'running', 'scheduled']);
  });

  it('narrows "paused" to the paused status alone', () => {
    expect(automationStatusesFor('paused')).toEqual(['paused']);
  });

  it('sends no status narrowing at all for "all"', () => {
    // `undefined` is what keeps the store's SWR key on the unfiltered signature
    // instead of an empty status list the server would read as "match nothing".
    expect(automationStatusesFor('all')).toBeUndefined();
  });
});
