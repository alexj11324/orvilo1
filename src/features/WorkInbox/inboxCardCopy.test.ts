import { describe, expect, it } from 'vitest';

import { inboxCardTitleKey } from './inboxCardCopy';

describe('inboxCardTitleKey', () => {
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
