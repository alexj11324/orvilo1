import type { OrchestrationWorkflowItem } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import { MIN_OPERATION_LEASE_TIMEOUT_MS, resolveOperationLeaseTimeout } from './recoveryPolicy';

describe('resolveOperationLeaseTimeout', () => {
  it('does not allow a lease shorter than two durable heartbeat intervals', () => {
    const orchestrationWorkflow = {
      config: { recovery: { operationLeaseTimeoutMs: 10_000 } },
    } as OrchestrationWorkflowItem;

    expect(resolveOperationLeaseTimeout(orchestrationWorkflow)).toBe(
      MIN_OPERATION_LEASE_TIMEOUT_MS,
    );
  });
});
