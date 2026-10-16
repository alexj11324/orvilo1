import type { Context } from 'hono';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { getServerDB } from '@/database/core/db-adaptor';

import { ResponsesController } from './responses.controller';

vi.mock('@/database/core/db-adaptor', () => ({ getServerDB: vi.fn() }));
vi.mock('@/database/models/rbac', () => ({ RbacModel: class {} }));
vi.mock('../services/responses.service', () => ({ ResponsesService: class {} }));

describe('ResponsesController.createResponse', () => {
  it('rejects missing identity before accessing the database', async () => {
    const app = new Hono();
    app.post('/', (c) => {
      const context = {
        get: () => undefined,
        json: c.json.bind(c),
        req: { valid: () => ({ input: 'hello', model: 'agent-1' }) },
      } as unknown as Context;
      return new ResponsesController().createResponse(context);
    });

    const response = await app.request('/', { method: 'POST' });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Authentication required',
      success: false,
    });
    expect(getServerDB).not.toHaveBeenCalled();
  });
});
