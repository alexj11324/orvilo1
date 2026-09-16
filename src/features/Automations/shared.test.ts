import type { TaskDetailData, TaskListItem } from '@orvilo/types';
import i18next from 'i18next';
import { beforeAll, describe, expect, it } from 'vitest';

import {
  automationDetailNextRun,
  automationDetailTriggerSummary,
  automationNextRun,
  automationStatusOf,
  automationTriggerSummary,
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

describe('automation status', () => {
  it.each(['completed', 'failed', 'canceled'])(
    'does not present terminal task status %s as an active automation',
    (status) => {
      expect(automationStatusOf(status)).toBe('inactive');
      expect(automationNextRun({ ...scheduledTask, status } as TaskListItem)).toBeNull();
      expect(
        automationDetailNextRun({ ...scheduledDetail, status } as unknown as TaskDetailData),
      ).toBeNull();
    },
  );
});
