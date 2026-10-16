import { OrviloAgentApiName, OrviloAgentIdentifier } from '@orvilo/builtin-tool-orvilo-agent';
import {
  UserInteractionApiName,
  UserInteractionIdentifier,
} from '@orvilo/builtin-tool-user-interaction';
import { describe, expect, it } from 'vitest';

import {
  isCustomInteractionIdentifier,
  prepareCustomInteractionSubmit,
} from './customInteractionHandlers';

describe('customInteractionHandlers', () => {
  it('does not resolve historical Marketplace picks as an install interaction', async () => {
    const payload = { selectedTemplateIds: ['old-template'] };
    expect(isCustomInteractionIdentifier('orvilo-web-onboarding', 'showAgentMarketplace')).toBe(
      false,
    );
    expect(
      await prepareCustomInteractionSubmit('orvilo-web-onboarding', payload, {
        apiName: 'showAgentMarketplace',
      }),
    ).toEqual({ payload });
  });

  it.each([
    [OrviloAgentIdentifier, OrviloAgentApiName.askUserQuestion],
    [UserInteractionIdentifier, UserInteractionApiName.askUserQuestion],
  ])('persists structured ask-user answers for %s', async (identifier, apiName) => {
    const payload = { 'Which surfaces?': ['Chat', 'Settings'] };
    expect(await prepareCustomInteractionSubmit(identifier, payload, { apiName })).toEqual({
      options: { createUserMessage: false, pluginState: { askUserAnswers: payload } },
      payload,
    });
  });

  it.each(['devin', 'droid', 'qoder', 'grok-build', 'trae', 'codex', 'opencode'])(
    'keeps %s native questions and permission responses',
    (type) => {
      expect(isCustomInteractionIdentifier(type, 'askUserQuestion')).toBe(true);
    },
  );
});
