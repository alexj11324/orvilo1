import { describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';

import { KnowledgeBaseService } from '../../packages/openapi/src/services/knowledge-base.service';

vi.mock('@orvilo/database', async () => import('@/database/utils/workspace'));
vi.mock('@/server/services/file', () => ({ FileService: vi.fn() }));

// Retired producers must reject before any resource or object-storage access.
describe('retired OpenAPI knowledge-base writes', () => {
  it('rejects create/update/delete and preserves historical detail reads', async () => {
    const historical = { id: 'kb-1', name: 'Historical', userId: 'user-1' };
    const findById = vi.fn().mockResolvedValue(historical);
    const service = new KnowledgeBaseService({} as OrviloDatabase, 'user-1');
    Reflect.set(service, 'knowledgeBaseModel', { findById });
    for (const write of [
      () => service.createKnowledgeBase({ name: 'New' }),
      () => service.updateKnowledgeBase('kb-1', { name: 'Changed' }),
      () => service.deleteKnowledgeBase('kb-1'),
    ]) {
      await expect(write()).rejects.toMatchObject({
        name: 'AuthorizationError',
        message: 'Platform knowledge bases are retired',
      });
    }
    expect(findById).not.toHaveBeenCalled();
    Reflect.set(service, 'resolveOperationPermission', async () => ({ isPermitted: true }));
    Reflect.set(service, 'log', () => undefined);
    await expect(service.getKnowledgeBaseDetail('kb-1')).resolves.toMatchObject({
      knowledgeBase: { id: 'kb-1', name: 'Historical' },
    });
  });
});
