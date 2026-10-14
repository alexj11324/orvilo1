import type { OrviloDatabase } from '@orvilo/database';
import { describe, expect, it, vi } from 'vitest';

import { knowledgeBaseRuntime } from './knowledgeBase';

vi.mock('@orvilo/database', async () => import('@/database/utils/workspace'));
vi.mock('@/server/services/file', () => ({
  FileService: vi.fn(function () {
    return {};
  }),
}));

describe('retired knowledge-base builtin producers', () => {
  it('rejects stale create, membership, delete and KB document calls without touching the DB', async () => {
    const runtime = knowledgeBaseRuntime.factory({
      serverDB: {} as OrviloDatabase,
      toolManifestMap: {},
      userId: 'user-1',
    });
    for (const call of [
      () => runtime.createKnowledgeBase({ name: 'New' }),
      () => runtime.addFiles({ fileIds: ['file-1'], knowledgeBaseId: 'kb-1' }),
      () => runtime.removeFiles({ fileIds: ['file-1'], knowledgeBaseId: 'kb-1' }),
      () => runtime.deleteKnowledgeBase({ id: 'kb-1' }),
      () => runtime.createDocument({ content: 'New', title: 'New', knowledgeBaseId: 'kb-1' }),
    ]) {
      const result = await call();
      expect(result.success).toBe(false);
      expect(result.content).toContain('Platform knowledge bases are retired');
    }
  });
});
