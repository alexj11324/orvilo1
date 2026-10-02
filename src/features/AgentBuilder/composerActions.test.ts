import { describe, expect, it } from 'vitest';

import { builderLeftActions, builderRightActions } from './composerActions';

/**
 * Regression: the Agent Builder composer must offer the AGENT selector — never
 * a raw model picker. Work surfaces carry no model name/picker; model
 * selection lives only in Settings → Agents. Both AgentBuilderConversation
 * components (features + group profile) consume these shared constants.
 */
describe('composerActions', () => {
  it('right actions carry the agent selector and no model picker', () => {
    expect(builderRightActions).toEqual(['agent']);
    expect(builderRightActions).not.toContain('model');
  });

  it('left actions stay empty', () => {
    expect(builderLeftActions).toEqual([]);
  });
});
