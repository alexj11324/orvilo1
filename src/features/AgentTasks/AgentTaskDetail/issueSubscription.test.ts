import { describe, expect, it } from 'vitest';

import { getIssueSubscriptionView } from './issueSubscription';

describe('getIssueSubscriptionView', () => {
  it('offers Subscribe until the detail says the reader is subscribed', () => {
    expect(getIssueSubscriptionView(undefined)).toMatchObject({
      actionKey: 'myWork.subscribe',
      stateKey: 'taskDetail.subscription.off',
      subscribed: false,
    });
    expect(getIssueSubscriptionView(false).subscribed).toBe(false);
  });

  it('offers Unsubscribe to a subscribed reader', () => {
    expect(getIssueSubscriptionView(true)).toEqual({
      actionKey: 'myWork.unsubscribe',
      failedKey: 'myWork.unsubscribeFailed',
      stateKey: 'taskDetail.subscription.on',
      subscribed: true,
    });
  });

  it('shows the requested value while the write is in flight', () => {
    expect(getIssueSubscriptionView(true, false).subscribed).toBe(false);
    expect(getIssueSubscriptionView(false, true).actionKey).toBe('myWork.unsubscribe');
  });
});
