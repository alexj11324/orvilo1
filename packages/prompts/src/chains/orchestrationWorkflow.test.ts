import { describe, expect, it } from 'vitest';

import {
  chainOrchestrationWorkflowCriteriaDraft,
  chainOrchestrationWorkflowDecompose,
  ORCHESTRATION_WORKFLOW_CRITERIA_DRAFT_JSON_SCHEMA,
  ORCHESTRATION_WORKFLOW_CRITERIA_DRAFT_PROMPT_VERSION,
  ORCHESTRATION_WORKFLOW_DECOMPOSE_PROMPT_VERSION,
} from './orchestrationWorkflow';

describe('chainOrchestrationWorkflowCriteriaDraft', () => {
  it('owns a dedicated version, schema, and standing-orchestration workflow prompt', () => {
    const chain = chainOrchestrationWorkflowCriteriaDraft({
      context: 'Orchestration workflow: Release the product',
      orchestrationWorkflow: 'Ship a polished v1',
      maxCriteria: 6,
    });

    expect(ORCHESTRATION_WORKFLOW_CRITERIA_DRAFT_PROMPT_VERSION).toBe('v3');
    expect(ORCHESTRATION_WORKFLOW_CRITERIA_DRAFT_JSON_SCHEMA.name).toBe(
      'orchestration_workflow_criteria_draft',
    );
    expect(chain.messages[0].content).toContain('persistent autonomous orchestration workflow');
    expect(chain.messages[0].content).toContain('at most 6 criteria');
    expect(chain.messages[0].content).toContain(
      'top-level instruction is a complete, actionable task brief',
    );
    expect(chain.messages[0].content).toContain(
      'criteria[].instruction is the exact, detailed judging rubric',
    );
    expect(chain.messages[0].content).toContain('Preserve every explicit numeric threshold');
    expect(chain.messages[0].content).toContain('do not invent an arbitrary one');
    expect(ORCHESTRATION_WORKFLOW_CRITERIA_DRAFT_JSON_SCHEMA.schema.required).toEqual([
      'title',
      'instruction',
      'criteria',
    ]);
    expect(chain.messages[1].content).toContain('Ship a polished v1');
  });
});

describe('chainOrchestrationWorkflowDecompose', () => {
  it('aligns investigation and implementation responsibilities with their own pass conditions', () => {
    const requirement = '升级 PPT、Word、Excel 编辑体验，支持编辑、保存和重开。';
    const { messages } = chainOrchestrationWorkflowDecompose({ requirement });
    const prompt = messages[0].content;

    expect(ORCHESTRATION_WORKFLOW_DECOMPOSE_PROMPT_VERSION).toBe('v5');
    expect(messages[1].content).toContain(requirement);
    expect(prompt).toContain('a request to build, fix, or upgrade requires implementation');
    expect(prompt).toContain('It may pass when it proves a capability is missing');
    expect(prompt).toContain(
      'assign explicit implementation ownership for every requested capability',
    );
    expect(prompt).toContain('include dependent implementation tasks that consume its findings');
    expect(prompt).toContain('discovering a read-only viewer triggers implementation');
    expect(prompt).toContain(
      'an investigation-only orchestration workflow must not become an implementation task',
    );
  });
});
