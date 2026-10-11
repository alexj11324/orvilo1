/**
 * What the Issue header's subscribe toggle shows. `pending` is the value the
 * reader just asked for and the server has not confirmed yet: the control
 * reflects it at once and falls back to the server's answer when it settles
 * (or when the write fails).
 */
export interface IssueSubscriptionView {
  /** `common` key naming what a click does. */
  actionKey: 'myWork.subscribe' | 'myWork.unsubscribe';
  /** `common` key for the toast when that click fails. */
  failedKey: 'myWork.subscribeFailed' | 'myWork.unsubscribeFailed';
  /** `chat` key describing the current state and the way out of it. */
  stateKey: 'taskDetail.subscription.off' | 'taskDetail.subscription.on';
  subscribed: boolean;
}

export const getIssueSubscriptionView = (
  isSubscribed: boolean | undefined,
  pending?: boolean,
): IssueSubscriptionView => {
  const subscribed = pending ?? isSubscribed === true;
  return subscribed
    ? {
        actionKey: 'myWork.unsubscribe',
        failedKey: 'myWork.unsubscribeFailed',
        stateKey: 'taskDetail.subscription.on',
        subscribed,
      }
    : {
        actionKey: 'myWork.subscribe',
        failedKey: 'myWork.subscribeFailed',
        stateKey: 'taskDetail.subscription.off',
        subscribed,
      };
};
