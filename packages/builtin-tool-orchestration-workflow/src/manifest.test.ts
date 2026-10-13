import { describe, expect, it } from 'vitest';

import { OrchestrationWorkflowManifest } from './manifest';
import { OrchestrationWorkflowApiName } from './types';

describe('OrchestrationWorkflowManifest', () => {
  it('exposes only the canonical startOrchestrationWorkflow workflow', () => {
    expect(OrchestrationWorkflowManifest.identifier).toBe('orvilo-orchestration-workflow');
    expect(OrchestrationWorkflowManifest.api.map(({ name }) => name)).toEqual([
      OrchestrationWorkflowApiName.startOrchestrationWorkflow,
    ]);
    // 'always' cannot be bypassed by the user's auto-run approval mode —
    // launching a orchestration workflow must always pause for the user to review the acceptance plan
    expect(OrchestrationWorkflowManifest.api[0].humanIntervention).toBe('always');
    expect(OrchestrationWorkflowManifest.api[0].work).toBeUndefined();
  });
});
