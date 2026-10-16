import { Hono } from 'hono';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { runVerifyAfterEvidenceSubmission } from '@/server/services/verify/lifecycle';

import { onEvidenceComplete } from './onEvidenceComplete';

vi.mock('@/database/server', () => ({ getServerDB: vi.fn().mockResolvedValue({ db: true }) }));
vi.mock('@/server/services/verify/lifecycle', () => ({
  runVerifyAfterEvidenceSubmission: vi.fn().mockResolvedValue(undefined),
}));

const post = (body: Record<string, unknown>) => {
  const app = new Hono().post('/', onEvidenceComplete);
  return app.request('/', {
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
    method: 'POST',
  });
};

describe('onEvidenceComplete', () => {
  beforeEach(() => vi.clearAllMocks());

  const base = { deliverable: 'done', parentOperationId: 'op_1', userId: 'user_1' };

  it('passes the orchestrationWorkflow requirement to verification', async () => {
    const res = await post({ ...base, orchestrationWorkflow: 'ship it' });
    expect(res.status).toBe(200);
    expect(runVerifyAfterEvidenceSubmission).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      { deliverable: 'done', operationId: 'op_1', orchestrationWorkflow: 'ship it' },
      undefined,
    );
  });

  it('decodes the legacy body.goal field from callbacks queued before the rename', async () => {
    await post({ ...base, goal: 'legacy requirement' });
    expect(runVerifyAfterEvidenceSubmission).toHaveBeenCalledWith(
      expect.anything(),
      'user_1',
      expect.objectContaining({ orchestrationWorkflow: 'legacy requirement' }),
      undefined,
    );
  });
});
