import { describe, expect, it } from 'vitest';

import { buildWorkspaceAwarePath } from '@/features/Workspace/workspaceAwarePath';

import { draftEditPath } from './draftEditPath';

describe('Drafts issue navigation', () => {
  it('opens the visible issue identifier and keeps draft restore mode', () => {
    const draft = {
      taskId: 'taskparity0001',
      taskIdentifier: 'PTP-1',
      taskName: 'Synthetic parity issue',
    };

    expect(draftEditPath(draft)).toBe('/task/PTP-1/synthetic-parity-issue?draft=1');
    expect(buildWorkspaceAwarePath(draftEditPath(draft), 'orvilo')).toBe(
      '/orvilo/task/PTP-1/synthetic-parity-issue?draft=1',
    );
  });
});
