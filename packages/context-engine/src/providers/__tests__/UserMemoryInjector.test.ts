import { describe, expect, it } from 'vitest';

import type { PipelineContext } from '../../types';
import { UserMemoryInjector } from '../UserMemoryInjector';

describe('retired platform memory injection', () => {
  it('does not inject cached persona or memories even with a persisted enabled flag', async () => {
    const context: PipelineContext = {
      initialState: { messages: [] },
      isAborted: false,
      messages: [{ content: 'Explicit session reference', role: 'user' }],
      metadata: {},
    };
    const provider = new UserMemoryInjector({
      enabled: true,
      memories: {
        identities: [{ description: 'Cached identity', id: 'id-1' }],
        persona: { narrative: 'Cached persona', tagline: 'Cached tagline' },
      },
    });
    const result = await provider.process(context);
    expect(result.messages).toEqual(context.messages);
    expect(result.metadata.userMemoryInjected).toBeUndefined();
  });
});
