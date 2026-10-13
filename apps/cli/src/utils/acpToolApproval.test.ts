import { describe, expect, it } from 'vitest';

import { buildAcpToolApprovalQuestion } from './acpToolApproval';

describe('ACP orchestration plan approval', () => {
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
