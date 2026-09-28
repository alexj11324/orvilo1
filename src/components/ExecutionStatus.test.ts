import { describe, expect, it } from 'vitest';

import { resolveProjectStatus, resolveTaskStatus } from './ExecutionStatus';

describe('resolveProjectStatus', () => {
  it('preserves supported project statuses', () => {
    expect(resolveProjectStatus('active')).toBe('active');
    expect(resolveProjectStatus('completed')).toBe('completed');
  });

  it('falls back to backlog for missing or unknown persisted values', () => {
    expect(resolveProjectStatus(undefined)).toBe('backlog');
    expect(resolveProjectStatus(null)).toBe('backlog');
    expect(resolveProjectStatus('in_progress')).toBe('backlog');
  });
});

describe('resolveTaskStatus', () => {
  it('preserves supported task statuses', () => {
    expect(resolveTaskStatus('running')).toBe('running');
    expect(resolveTaskStatus('paused')).toBe('paused');
  });

  it('falls back to backlog for missing, workflow-category, or unknown values', () => {
    expect(resolveTaskStatus(undefined)).toBe('backlog');
    expect(resolveTaskStatus(null)).toBe('backlog');
    expect(resolveTaskStatus('in_progress')).toBe('backlog');
  });
});
