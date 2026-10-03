import { describe, expect, it } from 'vitest';

import { resolveOwnerBinding } from './resolveOwnerBinding';

/**
 * The conversation is the navigation unit: `/chat/:topicId` binds the topic's
 * owner agent — never a URL segment — and `/chat/new` binds nothing so the
 * composer falls back to the explicit-pick / last-used chain. A refactor that
 * re-couples binding to the URL or the room's agent silently re-breaks the
 * handoff contract; these pins fail first.
 */
describe('resolveOwnerBinding', () => {
  describe('/chat/:topicId', () => {
    it('binds activeAgentId to the topic row’s agent', () => {
      expect(resolveOwnerBinding({ routeTopicId: 'tpc_1', topicAgentId: 'agent-a' })).toEqual({
        activeAgentId: 'agent-a',
        configAgentId: 'agent-a',
      });
    });

    it('re-binds to the new owner after a Continue handoff flips topic.agentId', () => {
      // Same route, same topic id — only the row's agentId changed. The
      // binding follows the row, which is why a handoff never navigates.
      expect(resolveOwnerBinding({ routeTopicId: 'tpc_1', topicAgentId: 'agent-b' })).toEqual({
        activeAgentId: 'agent-b',
        configAgentId: 'agent-b',
      });
    });

    it('binds nothing while the topic row is still loading', () => {
      // A deep link before the feed lands must not bind a stale or guessed
      // agent — the deep-link effect resolves the real owner, and `undefined`
      // here is the honest state, not a fallback to lastUsed/composer pick.
      expect(resolveOwnerBinding({ routeTopicId: 'tpc_1', topicAgentId: undefined })).toEqual({
        activeAgentId: undefined,
        configAgentId: undefined,
      });
    });

    it('ignores composer pick and last-used on a topic route', () => {
      // The composer chain belongs to the blank composer only — on a bound
      // conversation the topic's owner always wins.
      expect(
        resolveOwnerBinding({
          composerAgentId: 'agent-picked',
          lastUsedAgentId: 'agent-last',
          routeTopicId: 'tpc_1',
          topicAgentId: 'agent-owner',
        }),
      ).toEqual({ activeAgentId: 'agent-owner', configAgentId: 'agent-owner' });
    });
  });

  describe('/chat/new', () => {
    it('clears activeAgentId and hydrates config from the composer pick first', () => {
      expect(
        resolveOwnerBinding({
          composerAgentId: 'agent-picked',
          lastUsedAgentId: 'agent-last',
          routeTopicId: null,
        }),
      ).toEqual({ activeAgentId: undefined, configAgentId: 'agent-picked' });
    });

    it('falls back to lastUsedAgentId without an explicit pick', () => {
      expect(resolveOwnerBinding({ lastUsedAgentId: 'agent-last', routeTopicId: null })).toEqual({
        activeAgentId: undefined,
        configAgentId: 'agent-last',
      });
    });

    it('binds nothing when the user has never picked or sent', () => {
      expect(resolveOwnerBinding({ routeTopicId: null })).toEqual({
        activeAgentId: undefined,
        configAgentId: undefined,
      });
    });
  });
});
