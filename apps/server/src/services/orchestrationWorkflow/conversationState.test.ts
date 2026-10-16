import { describe, expect, it } from 'vitest';

import { orchestrationWorkflowWaitingReason } from './conversationState';

describe('orchestration workflow waiting reasons', () => {
  const ready = { decisionPending: false, deviceOnline: true, dispatchAllowed: true };
  const item = { config: { planConfirmedAt: '2026-10-13T12:00:00Z' }, status: 'running' as const };
  it('distinguishes approval, decisions, dispatch admission, offline devices and pause', () => {
    expect(orchestrationWorkflowWaitingReason({ ...item, config: null }, ready)).toBe(
      'plan_not_confirmed',
    );
    expect(orchestrationWorkflowWaitingReason(item, { ...ready, decisionPending: true })).toBe(
      'decision_pending',
    );
    expect(orchestrationWorkflowWaitingReason(item, { ...ready, dispatchAllowed: false })).toBe(
      'dispatch_not_admitted',
    );
    expect(orchestrationWorkflowWaitingReason(item, { ...ready, deviceOnline: false })).toBe(
      'device_offline',
    );
    expect(orchestrationWorkflowWaitingReason({ ...item, status: 'paused' }, ready)).toBe('paused');
    expect(orchestrationWorkflowWaitingReason(item, ready)).toBeNull();
    expect(
      orchestrationWorkflowWaitingReason(
        { ...item, status: 'achieved' },
        { ...ready, dispatchAllowed: false },
      ),
    ).toBeNull();
  });
});
