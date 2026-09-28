import { describe, expect, it } from 'vitest';

import { resolveMineCollectionRedirect } from './mineCollectionRedirect';

describe('resolveMineCollectionRedirect', () => {
  it('maps only the exact personal collection URLs', () => {
    expect(resolveMineCollectionRedirect({ collection: 'mine', scope: 'assigned' })).toBe(
      '/my-issues?tab=assigned',
    );
    expect(resolveMineCollectionRedirect({ collection: 'mine', scope: 'created' })).toBe(
      '/my-issues?tab=created',
    );
  });

  it('leaves agent, project, and other task URLs alone', () => {
    expect(
      resolveMineCollectionRedirect({
        agentId: 'agt_1',
        collection: 'mine',
        scope: 'assigned',
      }),
    ).toBeNull();
    expect(
      resolveMineCollectionRedirect({
        collection: 'mine',
        projectId: 'proj_1',
        scope: 'created',
      }),
    ).toBeNull();
    expect(resolveMineCollectionRedirect({ collection: 'mine', scope: 'review' })).toBeNull();
    expect(resolveMineCollectionRedirect({ collection: 'tasks', scope: 'assigned' })).toBeNull();
  });
});
