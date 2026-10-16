import { describe, expect, it } from 'vitest';

import { OrchestrationWorkflowManifest } from './manifest';
import { OrchestrationWorkflowApiName } from './types';

describe('OrchestrationWorkflowManifest', () => {
  it('exposes board splits and reply-based release without a confirmation button', () => {
    expect(OrchestrationWorkflowManifest.identifier).toBe('orvilo-orchestration-workflow');
    expect(OrchestrationWorkflowManifest.api.map(({ name }) => name)).toEqual([
      OrchestrationWorkflowApiName.prepareOrchestrationWorkflow,
      OrchestrationWorkflowApiName.postOrchestrationWorkflowPlan,
      OrchestrationWorkflowApiName.startOrchestrationWorkflow,
    ]);
    expect(
      OrchestrationWorkflowManifest.api.every((api) => api.humanIntervention === 'never'),
    ).toBe(true);
    expect(OrchestrationWorkflowManifest.api[0].work).toBeUndefined();
  });
});
