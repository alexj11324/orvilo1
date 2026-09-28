import { describe, expect, it } from 'vitest';

import enUS from '../../../locales/en-US/project.json';
import zhCN from '../../../locales/zh-CN/project.json';
import source from '../../../packages/locales/src/default/project';

const STATUSES = [
  'active',
  'archived',
  'backlog',
  'canceled',
  'completed',
  'paused',
  'planned',
  'reviewing',
] as const;

const pick = (record: Record<string, string>, key: string) => record[key];

describe('project status labels', () => {
  it('defines every lifecycle status in the source, en-US and zh-CN', () => {
    for (const status of STATUSES) {
      const key = `status.${status}`;
      expect(pick(source as Record<string, string>, key), `source ${key}`).toBeTruthy();
      expect(pick(enUS as Record<string, string>, key), `en-US ${key}`).toBeTruthy();
      expect(pick(zhCN as Record<string, string>, key), `zh-CN ${key}`).toBeTruthy();
    }
  });

  it("labels 'active' as In Progress, matching Linear", () => {
    // Regression: the project status chip rendered `acceptance.status.active`,
    // whose wording is "Active".
    expect(pick(enUS as Record<string, string>, 'status.active')).toBe('In Progress');
    expect(pick(source as Record<string, string>, 'status.active')).toBe('In Progress');
  });

  it('keeps completion-review wording out of the plain project lifecycle', () => {
    // Regression: project status borrowed `acceptance.status.*`, so a merely
    // completed project read "已完成并通过验收" (completed AND accepted) and one
    // under review read "等待你的验收" (awaiting your review). Those strings describe
    // the acceptance review, which is a different concept with its own surface.
    expect(pick(zhCN as Record<string, string>, 'status.completed')).not.toContain('验收');
    expect(pick(zhCN as Record<string, string>, 'status.reviewing')).not.toContain('验收');
    expect(pick(enUS as Record<string, string>, 'status.completed')).not.toContain('accepted');
  });
});
