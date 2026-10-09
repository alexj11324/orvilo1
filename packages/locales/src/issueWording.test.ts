import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const readLocale = (lang: string, ns: string): Record<string, string> =>
  JSON.parse(readFileSync(path.resolve(__dirname, '../../../locales', lang, `${ns}.json`), 'utf8'));

// Keys that name the Issue entity: zh-CN writes it as "Issue" and en-US as "issue(s)".
const ISSUE_ENTITY_KEYS: [ns: string, key: string][] = [
  ['common', 'tab.issues'],
  ['common', 'tab.tasks'],
  ['common', 'teams.newIssue'],
  ['topic', 'taskManager.welcome'],
  ['chat', 'sendPlaceholderHeterogeneous'],
  ['chat', 'sendPlaceholderWithAgentAssignment'],
];

describe('Issue entity wording', () => {
  it.each(ISSUE_ENTITY_KEYS)('zh-CN %s / %s does not translate Issue', (ns, key) => {
    const value = readLocale('zh-CN', ns)[key];
    expect(value).toMatch(/Issue/);
    expect(value).not.toMatch(/事项|任务|议题/);
  });

  it.each(ISSUE_ENTITY_KEYS)('en-US %s / %s says issue, not task', (ns, key) => {
    const value = readLocale('en-US', ns)[key];
    expect(value).toMatch(/issue/i);
    expect(value).not.toMatch(/\btasks?\b/i);
  });
});

describe('zh-CN triage wording', () => {
  it('uses 分诊 everywhere and never 分流', () => {
    const triageKeys: [string, string][] = [
      ['chat', 'taskList.filter.groups.triage'],
      ['chat', 'taskList.filter.notInTriage'],
      ['chat', 'taskList.kanban.triage'],
      ['chat', 'taskDetail.workflow.category.triage'],
      ['common', 'teams.navTriage'],
    ];
    for (const [ns, key] of triageKeys) {
      const value = readLocale('zh-CN', ns)[key];
      expect(value, key).toMatch(/分诊/);
      expect(value, key).not.toMatch(/分流/);
    }
  });
});
