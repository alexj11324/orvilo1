// @vitest-environment node
import type { ProviderBindingConfig } from '@orvilo/types';
import { beforeEach, describe, expect, it } from 'vitest';

import type { ProviderBindingModel } from '@/database/models/providerBinding';

import { createClosedProviderComposition } from './closedBroker';
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

const state = {
  owned: true,
  ownsCalls: 0,
  revision: 1,
};

const model = {
  find: async () => ({ ...row, revision: state.revision }),
  ownsCredentialReference: async () => {
    state.ownsCalls += 1;
    return state.owned;
  },
} as unknown as ProviderBindingModel;

describe('provider configuration check', () => {
  beforeEach(() => {
    state.owned = true;
    state.ownsCalls = 0;
    state.revision = 1;
  });

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

  it('rejects a stale revision before reading the credential', async () => {
    state.revision = 2;
    await expect(
      checkProviderBinding(model, userId, { id: bindingId, revision: 1 }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'BINDING_UNAVAILABLE_OR_CHANGED',
    });
    expect(state.ownsCalls).toBe(0);
  });

  it('rejects a credential reference the owner does not hold', async () => {
    state.owned = false;
    await expect(
      checkProviderBinding(model, userId, { id: bindingId, revision: 1 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects a closed composition resolved for a different owner', async () => {
    await expect(
      checkProviderBinding(
        model,
        userId,
        { id: bindingId, revision: 1 },
        createClosedProviderComposition(model, 'other-user'),
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('fails closed when the binding revision changes during the canonical check', async () => {
    const changing = {
      find: async () => {
        const current = state.revision;
        state.revision += 1;
        return { ...row, revision: current };
      },
      ownsCredentialReference: async () => true,
    } as unknown as ProviderBindingModel;
    await expect(
      checkProviderBinding(changing, userId, { id: bindingId, revision: 1 }),
    ).rejects.toMatchObject({
      code: 'CONFLICT',
      message: 'BINDING_UNAVAILABLE_OR_CHANGED',
    });
  });

  it('fails closed when credential ownership disappears during the canonical check', async () => {
    let calls = 0;
    const rotating = {
      find: async () => row,
      ownsCredentialReference: async () => {
        calls += 1;
        return calls === 1;
      },
    } as unknown as ProviderBindingModel;
    await expect(
      checkProviderBinding(rotating, userId, { id: bindingId, revision: 1 }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    expect(calls).toBeGreaterThan(1);
  });
});
