import type {
  OrchestrationWorkflowStatus as OrchestrationWorkflowStatusType,
  OrchestrationWorkflowSubjectType as OrchestrationWorkflowSubjectTypeType,
} from '@orvilo/types';
import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  orchestrationWorkflowStatuses,
  orchestrationWorkflowSubjectTypes,
} from './orchestrationWorkflow';

describe('orchestration workflow consts', () => {
  it('stays in sync with the @orvilo/types unions', () => {
    expectTypeOf<
      (typeof orchestrationWorkflowStatuses)[number]
    >().toEqualTypeOf<OrchestrationWorkflowStatusType>();
    expectTypeOf<
      (typeof orchestrationWorkflowSubjectTypes)[number]
    >().toEqualTypeOf<OrchestrationWorkflowSubjectTypeType>();
  });

  it('keeps terminal states last-ish sanity', () => {
    expect(orchestrationWorkflowStatuses).toContain('achieved');
    expect(orchestrationWorkflowSubjectTypes).toContain('task');
  });
});
