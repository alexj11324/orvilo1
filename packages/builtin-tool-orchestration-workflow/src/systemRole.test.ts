import { describe, expect, it } from 'vitest';

import { systemPrompt } from './systemRole';

describe('Orchestration workflow systemPrompt', () => {
  it('hands successful orchestration workflow execution off instead of duplicating it', () => {
    expect(systemPrompt).toContain('Its coordinator decomposes and dispatches Issues');
    expect(systemPrompt).toContain(
      'do not perform, reproduce, preview, or self-check the requested work in this conversation',
    );
    expect(systemPrompt).toContain('The person must actually see and confirm it');
    expect(systemPrompt).toContain('For questions, explanations, or quick replies');
  });
});
