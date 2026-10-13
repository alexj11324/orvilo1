import { describe, expect, it } from 'vitest';

import { buildAcpToolApprovalOptions, buildAcpToolApprovalQuestion } from './acpToolApproval';

describe('ACP orchestration plan approval', () => {
  it('defaults an unanswered plan approval to deny', () => {
    expect(buildAcpToolApprovalOptions('orvilo-orchestration-workflow')[0].id).toBe('deny');
    expect(buildAcpToolApprovalOptions('orvilo-orchestration-workflow')[1].id).toBe('approve');
  });

  it('shows criteria and budgets after a long instruction without truncation', () => {
    const args = {
      instruction: 'Detailed requirement. '.repeat(200),
      criteria: [{ title: 'Verify the final artifact' }],
      maxTotalCost: 42,
    };
    const question = buildAcpToolApprovalQuestion(
      'orvilo-orchestration-workflow',
      'startOrchestrationWorkflow',
      args,
    );
    expect(question).toContain(JSON.stringify(args));
    expect(question).toContain('Verify the final artifact');
    expect(question).toContain('"maxTotalCost":42');
  });
});
