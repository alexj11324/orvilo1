// @vitest-environment node
import type { ProviderBindingConfig } from '@orvilo/types';
import { describe, expect, it } from 'vitest';

import type { ProviderBindingModel } from '@/database/models/providerBinding';

import { checkProviderBinding } from './configuration';

const userId = 'user-1';
const bindingId = '11111111-1111-4111-8111-111111111111';
const row = {
  id: bindingId,
  userId,
  revision: 1,
  config: {
    model: 'gpt-test',
    provider: 'openai',
    secretReference: 'credential:cred_fixture',
  } as ProviderBindingConfig,
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

const model = {
  find: async () => row,
  ownsCredentialReference: async () => true,
} as unknown as ProviderBindingModel;

describe('provider configuration check', () => {
  it('keeps the default canonical check unavailable', async () => {
    await expect(
      checkProviderBinding(model, userId, { id: bindingId, revision: 1 }),
    ).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: 'PROVIDER_CHECK_UNAVAILABLE',
    });
  });

  it('returns ready only for an explicitly injected successful check', async () => {
    const scope = {
      authorityRevision: 0,
      ownerId: userId,
      principalId: userId,
      tenantId: `user:${userId}`,
    };
    await expect(
      checkProviderBinding(
        model,
        userId,
        { id: bindingId, revision: 1 },
        {
          authorizeScope: async () => scope,
          broker: {
            capabilities: async () => ({ ok: true, value: [] }),
            checkBinding: async () => ({
              ok: true,
              value: {
                bindingId,
                bindingRevision: 1,
                checkedAt: 1,
                status: 'ready',
              },
            }),
          },
        },
      ),
    ).resolves.toMatchObject({ status: 'ready', bindingId });
  });
});
