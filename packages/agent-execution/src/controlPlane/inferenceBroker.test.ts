// @vitest-environment node
import { describe, expect, it } from 'vitest';

import type { InferenceEvent, InferenceRequest, ProviderBindingRequest } from './contracts';
import type {
  ConfigurationAuthoritySnapshot,
  InferenceAuthoritySnapshot,
  TrustedProviderBackend,
} from './inferenceBroker';
import { createInferenceBroker, createProviderConfigurationBroker } from './inferenceBroker';

const fence = {
  tenantId: 'tenant',
  principalId: 'principal',
  taskId: 'task',
  grantId: 'grant',
  ownerId: 'owner',
  leaseId: 'lease',
  epoch: 1,
  policyRevision: 1,
  stateRevision: 1,
};
const binding = {
  schemaVersion: 1,
  bindingId: 'binding',
  tenantId: 'tenant',
  ownerId: 'owner',
  revision: 1,
  providerId: 'provider',
  secretReference: 'vault:test-fixture',
  modelRoutes: ['text'],
} as const;
const request = (): InferenceRequest => ({
  schemaVersion: 1,
  fence: { ...fence },
  requestId: 'request',
  modelRoute: 'text',
  bindingRevision: 1,
  messages: [{ role: 'user', content: 'test' }],
  maxOutputTokens: 10,
});
const snapshot = (): InferenceAuthoritySnapshot => ({
  fence: { ...fence },
  grantRevoked: false,
  grantExpiresAt: 200,
  leaseExpiresAt: 200,
  bindingOwnerId: 'owner',
  binding: { ...binding, modelRoutes: ['text'] },
  capability: { modelRoute: 'text', text: true, images: false, tools: false, maxOutputTokens: 20 },
});
const scope = {
  tenantId: 'tenant',
  principalId: 'principal',
  ownerId: 'owner',
  authorityRevision: 1,
};
const configurationRequest = (): ProviderBindingRequest => ({
  schemaVersion: 1,
  scope: { ...scope },
  bindingId: 'binding',
  bindingRevision: 1,
});
const configurationSnapshot = (): ConfigurationAuthoritySnapshot => ({
  scope: { ...scope },
  revoked: false,
  canCheck: true,
  binding: { ...binding, modelRoutes: ['text'] },
});
const collect = async (events: AsyncIterable<InferenceEvent>) => {
  const output: InferenceEvent[] = [];
  for await (const event of events) output.push(event);
  return output;
};
const backend = (): TrustedProviderBackend => ({
  async capabilities() {
    return [];
  },
  async check() {
    return true;
  },
  async *infer() {
    yield { type: 'text', text: 'answer' };
  },
});

// Real broker execution with explicit test authority/backend boundaries; no provider IO.
describe('inference broker admission and live authority', () => {
  it.each([
    [
      'incomplete fence',
      (value: InferenceAuthoritySnapshot) => {
        Reflect.deleteProperty(value.fence, 'principalId');
      },
    ],
    [
      'NaN grant',
      (value: InferenceAuthoritySnapshot) => {
        value.grantExpiresAt = NaN;
      },
    ],
    [
      'NaN lease',
      (value: InferenceAuthoritySnapshot) => {
        value.leaseExpiresAt = NaN;
      },
    ],
    [
      'NaN capability budget',
      (value: InferenceAuthoritySnapshot) => {
        value.capability.maxOutputTokens = NaN;
      },
    ],
  ] as const)('denies %s before backend IO', async (_name, mutate) => {
    const value = snapshot();
    mutate(value);
    let calls = 0;
    const implementation = backend();
    implementation.infer = async function* () {
      calls++;
      yield { type: 'text', text: 'should not run' };
    };
    const broker = createInferenceBroker({
      authority: {
        async resolve() {
          return value;
        },
      },
      backend: implementation,
      now: () => 100,
    });
    expect(await collect(broker.infer(request()))).toMatchObject([{ type: 'error' }]);
    expect(calls).toBe(0);
  });

  it.each(['revocation', 'rotation'] as const)(
    'stops and closes upstream on in-place %s',
    async (change) => {
      const value = snapshot();
      let closed = false;
      const implementation = backend();
      implementation.infer = async function* () {
        try {
          yield { type: 'text', text: 'first' };
          if (change === 'revocation') value.grantRevoked = true;
          else value.binding.secretReference = 'vault:rotated-fixture';
          yield { type: 'text', text: 'must be withheld' };
        } finally {
          closed = true;
        }
      };
      const broker = createInferenceBroker({
        authority: {
          async resolve() {
            return value;
          },
        },
        backend: implementation,
        now: () => 100,
      });
      expect(await collect(broker.infer(request()))).toMatchObject([
        { type: 'text', text: 'first' },
        { type: 'error' },
      ]);
      expect(closed).toBe(true);
    },
  );

  it('sanitizes backend exceptions and error bodies', async () => {
    for (const throwError of [true, false]) {
      const implementation = backend();
      implementation.infer = async function* () {
        if (throwError) throw new Error('sensitive-fixture');
        yield {
          type: 'error',
          error: { code: 'runtime_failed', message: 'sensitive-fixture', retryable: false },
        };
      };
      const broker = createInferenceBroker({
        authority: {
          async resolve() {
            return snapshot();
          },
        },
        backend: implementation,
        now: () => 100,
      });
      const result = await collect(broker.infer(request()));
      expect(result).toMatchObject([{ type: 'error' }]);
      expect(JSON.stringify(result)).not.toContain('sensitive-fixture');
    }
  });
});

describe('configuration broker authority and truthful readiness', () => {
  it('denies omitted principal in authoritative scope before backend IO', async () => {
    const value = configurationSnapshot();
    Reflect.deleteProperty(value.scope, 'principalId');
    let checks = 0;
    const implementation = backend();
    implementation.check = async () => {
      checks++;
      return true;
    };
    const broker = createProviderConfigurationBroker({
      authority: {
        async resolve() {
          return value;
        },
      },
      backend: implementation,
    });
    expect(await broker.checkBinding(configurationRequest())).toMatchObject({ ok: false });
    expect(checks).toBe(0);
  });

  it('rejects a live in-place secret rotation during check', async () => {
    const value = configurationSnapshot();
    const implementation = backend();
    implementation.check = async () => {
      value.binding.secretReference = 'vault:rotated-fixture';
      return true;
    };
    const broker = createProviderConfigurationBroker({
      authority: {
        async resolve() {
          return value;
        },
      },
      backend: implementation,
    });
    expect(await broker.checkBinding(configurationRequest())).toMatchObject({
      ok: false,
      error: { code: 'stale_fence' },
    });
  });

  it('requires literal successful backend check rather than a truthy error object', async () => {
    const implementation = backend();
    implementation.check = async () => ({ error: 'fixture failure' }) as unknown as boolean;
    const broker = createProviderConfigurationBroker({
      authority: {
        async resolve() {
          return configurationSnapshot();
        },
      },
      backend: implementation,
    });
    expect(await broker.checkBinding(configurationRequest())).toMatchObject({
      ok: true,
      value: { status: 'unavailable' },
    });
  });
});
