import { describe, expect, it } from 'vitest';

import { buildOrviloSessionEnv } from './sessionEnv';

describe('buildOrviloSessionEnv', () => {
  it('echoes the conversation ids the child process can attribute its output to', () => {
    expect(
      buildOrviloSessionEnv({ agentId: 'agt_1', operationId: 'op_1', topicId: 'tpc_1' }),
    ).toEqual({
      ORVILO_AGENT_ID: 'agt_1',
      ORVILO_OPERATION_ID: 'op_1',
      ORVILO_TOPIC_ID: 'tpc_1',
    });
  });

  it('omits an id that did not resolve rather than exporting an empty var', () => {
    // A var set to '' or 'undefined' reads as present to every consumer down the
    // chain — `lh` would stamp a report with a topic id that resolves to nothing.
    expect(
      buildOrviloSessionEnv({ agentId: 'agt_1', operationId: null, topicId: undefined }),
    ).toEqual({ ORVILO_AGENT_ID: 'agt_1' });
  });

  it('is empty when the run carries no conversation at all', () => {
    expect(buildOrviloSessionEnv({})).toEqual({});
  });
});
