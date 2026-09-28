import { manualModeExcludeToolIds } from '@orvilo/builtin-tools';
import { describe, expect, it } from 'vitest';

import { getToolContextRefreshKey, getToolExcludeDefaultToolIds } from './utils';

describe('Token tool utils', () => {
  describe('getToolContextRefreshKey', () => {
    it('changes when web search switches between off and application search', () => {
      const baseKey = getToolContextRefreshKey({
        agentId: 'agent-1',
        searchMode: 'off',
        useModelBuiltinSearch: false,
      });

      expect(
        getToolContextRefreshKey({
          agentId: 'agent-1',
          searchMode: 'auto',
          useModelBuiltinSearch: false,
        }),
      ).not.toBe(baseKey);
    });

    it('changes when web search switches between application and model builtin search', () => {
      const appSearchKey = getToolContextRefreshKey({
        agentId: 'agent-1',
        searchMode: 'auto',
        useModelBuiltinSearch: false,
      });

      expect(
        getToolContextRefreshKey({
          agentId: 'agent-1',
          searchMode: 'auto',
          useModelBuiltinSearch: true,
        }),
      ).not.toBe(appSearchKey);
    });

    it('changes when switching between chat and agent modes', () => {
      const chatModeKey = getToolContextRefreshKey({
        agentId: 'agent-1',
        enableAgentMode: false,
      });

      expect(
        getToolContextRefreshKey({
          agentId: 'agent-1',
          enableAgentMode: true,
        }),
      ).not.toBe(chatModeKey);
    });
  });

  describe('getToolExcludeDefaultToolIds', () => {
    it('excludes discovery tools in manual skill mode', () => {
      // Asserted against the real list rather than a literal: the sample used to
      // be `['orvilo-activator', 'orvilo-skill-store']`, and the hidden-surface
      // retirement removed the skill store from that list, which made this case
      // fail for a reason that had nothing to do with the helper under test.
      expect(getToolExcludeDefaultToolIds('manual')).toEqual(manualModeExcludeToolIds);
      // Non-vacuity: an empty constant would satisfy the equality above.
      expect(manualModeExcludeToolIds.length).toBeGreaterThan(0);
    });

    it('keeps default tools in auto skill mode', () => {
      expect(getToolExcludeDefaultToolIds('auto')).toBeUndefined();
    });
  });
});
