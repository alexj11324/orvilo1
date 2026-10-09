import { describe, expect, it } from 'vitest';

import { inboxCardTitleKey } from './inboxCardCopy';

describe('inboxCardTitleKey', () => {
  it('keeps a native question on its Issue title instead of calling it a generic approval', () => {
    expect(
      inboxCardTitleKey({
        actionRef: { kind: 'acp_intervention', requestId: 'message-1' },
        nativeIntervention: {
          agentId: 'agent-1',
          messageId: 'message-1',
          operationId: 'original-op',
          toolCallId: 'original-call',
          topicId: 'topic-1',
        },
      }),
    ).toBeNull();
  });
  it('uses outgoing-specific copy so withdraw cards are not labeled as pending-for-me', () => {
    expect(
      inboxCardTitleKey({
        actionRef: { kind: 'resource_transfer', requestId: 'xfer_1' },
        outgoing: true,
      }),
    ).toBe('inbox.source.resourceTransferOutgoing');
    expect(
      inboxCardTitleKey({
        actionRef: { kind: 'acp_permission', requestId: 'apr_1' },
        outgoing: false,
      }),
    ).toBe('inbox.source.acpPermission');
  });
});
