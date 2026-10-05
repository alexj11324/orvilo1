// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { decideCausation, decideReplayGap, MAX_EVENT_CAUSATION_DEPTH } from './eventDispatchPolicy';

describe('event dispatch policy', () => {
  it('rejects a truncated replay gap and still allows an older opaque cursor', () => {
    expect(decideReplayGap({ truncated: true })).toBe('invalid-event');
    expect(decideReplayGap({ truncated: false })).toBeUndefined();
  });

  it('rejects a causation cycle, a foreign workspace, and a root that is never reached', () => {
    expect(
      decideCausation({
        causationId: 'cause',
        links: [
          { id: 'cause', sourceDispatchId: 'root', workspaceId: 'workspace' },
          { id: 'root', sourceDispatchId: null, workspaceId: 'workspace' },
        ],
        rootDispatchId: 'root',
        workspaceId: 'workspace',
      }),
    ).toBeUndefined();
    expect(
      decideCausation({
        causationId: 'cause',
        links: [
          { id: 'cause', sourceDispatchId: 'next', workspaceId: 'workspace' },
          { id: 'next', sourceDispatchId: 'cause', workspaceId: 'workspace' },
          { id: 'cause', sourceDispatchId: 'cause', workspaceId: null },
        ],
        workspaceId: 'workspace',
      }),
    ).toBe('loop');
    expect(
      decideCausation({
        causationId: 'cause',
        links: [{ id: 'cause', sourceDispatchId: null, workspaceId: 'other' }],
        workspaceId: 'workspace',
      }),
    ).toBe('tenant-mismatch');
    expect(
      decideCausation({
        causationId: 'cause',
        links: [{ id: 'cause', sourceDispatchId: null, workspaceId: 'workspace' }],
        rootDispatchId: 'root',
        workspaceId: 'workspace',
      }),
    ).toBe('loop');
    expect(
      decideCausation({
        links: [],
        rootDispatchId: 'root',
        workspaceId: 'workspace',
      }),
    ).toBe('invalid-event');
    expect(
      decideCausation({
        causationId: 'missing',
        links: [],
        workspaceId: 'workspace',
      }),
    ).toBe('invalid-event');
  });

  it('fails closed when a causation chain is longer than the checked prefix', () => {
    const links = Array.from({ length: MAX_EVENT_CAUSATION_DEPTH }, (_, index) => ({
      id: `dispatch-${index}`,
      sourceDispatchId: `dispatch-${index + 1}`,
      workspaceId: 'workspace',
    }));
    expect(
      decideCausation({
        causationId: 'dispatch-0',
        links,
        workspaceId: 'workspace',
      }),
    ).toBe('loop');
  });
});
