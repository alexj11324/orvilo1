import { describe, expect, it } from 'vitest';

import { chainGoalDecompose, GOAL_DECOMPOSE_PROMPT_VERSION } from './goal';

describe('chainGoalDecompose', () => {
  it('aligns investigation and implementation responsibilities with their own pass conditions', () => {
    const requirement = '升级 PPT、Word、Excel 编辑体验，支持编辑、保存和重开。';
    const { messages } = chainGoalDecompose({ requirement });
    const prompt = messages[0].content;

    expect(GOAL_DECOMPOSE_PROMPT_VERSION).toBe('v5');
    expect(messages[1].content).toContain(requirement);
    expect(prompt).toContain('a request to build, fix, or upgrade requires implementation');
    expect(prompt).toContain('It may pass when it proves a capability is missing');
    expect(prompt).toContain(
      'assign explicit implementation ownership for every requested capability',
    );
    expect(prompt).toContain('include dependent implementation tasks that consume its findings');
    expect(prompt).toContain('discovering a read-only viewer triggers implementation');
    expect(prompt).toContain('an investigation-only goal must not become an implementation task');
  });
});
