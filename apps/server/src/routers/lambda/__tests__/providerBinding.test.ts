// @vitest-environment node
import type { ProviderBindingConfig } from '@orvilo/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProviderBindingModel } from '@/database/models/providerBinding';

import { createProviderBindingRouter } from '../providerBinding';

vi.mock('@/database/models/providerBinding');
vi.mock('@/server/services/providerBinding/controlPlane', () => ({
  createProviderBindingComposition: vi.fn(),
}));

const mockUserId = 'test-user-id';
const createMockContext = () => ({ userId: mockUserId });

const bindingInput = (overrides: Partial<ProviderBindingConfig> = {}): ProviderBindingConfig => ({
  enabled: false,
  endpoint: 'https://provider.example.com/v1',
  model: 'test-model',
  name: 'Test Binding',
  provider: 'testprovider',
  secretReference: 'credential:cred_test',
  selection: {
    effort: 'default',
    mode: 'default',
    runtime: 'orvilo',
    speed: 'default',
    target: 'local',
  },
  ...overrides,
});

const storedRow = (config: ProviderBindingConfig) => ({
  config,
  createdAt: new Date(),
  id: 'pbd_test',
  revision: 1,
  updatedAt: new Date(),
});

describe('providerBindingRouter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(ProviderBindingModel).prototype.ownsCredentialReference = vi
      .fn()
      .mockResolvedValue(true);
  });

  describe('create', () => {
    it('forces enabled:false even when the request asks to arm the binding', async () => {
      const create = vi.fn().mockImplementation(async (config: ProviderBindingConfig) => ({
        ...storedRow(config),
        config,
      }));
      vi.mocked(ProviderBindingModel).prototype.create = create;

      const caller = createProviderBindingRouter().createCaller(createMockContext());
      const result = await caller.create(bindingInput({ enabled: true }));

      // Arming is reserved for checkConnection's verified broker path — a
      // crafted save must not persist enabled:true.
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
      expect(result.data.enabled).toBe(false);
    });
  });

  describe('update', () => {
    it('forces enabled:false so a config edit disarms until re-verified', async () => {
      const update = vi.fn().mockImplementation(async (_id: string, _rev: number, config) => ({
        ...storedRow(config),
        config,
        revision: 2,
      }));
      vi.mocked(ProviderBindingModel).prototype.update = update;

      const caller = createProviderBindingRouter().createCaller(createMockContext());
      const result = await caller.update({
        config: bindingInput({ enabled: true }),
        id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        revision: 1,
      });

      expect(update).toHaveBeenCalledWith(
        'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        1,
        expect.objectContaining({ enabled: false }),
      );
      expect(result.data.enabled).toBe(false);
    });
  });
});
