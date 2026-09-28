import { describe, expect, it } from 'vitest';

import { commentComposerKey } from './commentComposerKey';

describe('task comment composer identity', () => {
  it('remounts for the same task when its workspace scope changes', () => {
    const original = commentComposerKey('PTP-1', 'workspace-a');
    expect(commentComposerKey('PTP-1', 'workspace-b')).not.toBe(original);
    expect(commentComposerKey('PTP-1', null)).not.toBe(original);
    expect(commentComposerKey('PTP-1', 'workspace-a')).toBe(original);
  });
});
