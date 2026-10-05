import { describe, expect, it, vi } from 'vitest';

import type { ProviderBindingModel } from '@/database/models/providerBinding';

import { checkProviderBinding, type ProviderConfigurationComposition } from './configuration';

describe('selected provider model readiness', () => {
  const check = async (modelRoutes: string[], selectedModel = 'selected-model') => {
    const model = {
      find: vi.fn(async () => ({
        id: 'binding',
        revision: 1,
        config: { model: selectedModel, secretReference: 'credential:cred_test' },
      })),
      ownsCredentialReference: vi.fn(async () => true),
      setEnabled: vi.fn(async () => true),
    };
    const scope = { ownerId: 'user', principalId: 'user', tenantId: 'user', authorityRevision: 1 };
    const composition = {
      authorizeScope: vi.fn(async () => scope),
      broker: {
        checkBinding: vi.fn(async () => ({
          ok: true,
          value: { bindingId: 'binding', bindingRevision: 1, checkedAt: 1, status: 'ready' },
        })),
        capabilities: vi.fn(async () => ({
          ok: true,
          value: modelRoutes.map((modelRoute) => ({
            modelRoute,
            text: true,
            tools: true,
            images: false,
            maxOutputTokens: 4096,
          })),
        })),
      },
    };
    const result = await checkProviderBinding(
      model as unknown as ProviderBindingModel,
      'user',
      { id: 'binding', revision: 1 },
      composition as ProviderConfigurationComposition,
    );
    return { result, model };
  };

  it('does not enable a binding when authentication succeeds but its selected model is absent', async () => {
    const { result, model } = await check(['another-model']);
    expect(result.status).toBe('unavailable');
    expect(model.setEnabled).not.toHaveBeenCalled();
  });

  it('enables a selected model reported by the trusted broker', async () => {
    const { result, model } = await check(['selected-model']);
    expect(result.status).toBe('ready');
    expect(model.setEnabled).toHaveBeenCalledWith('binding', true);
  });
  it('preserves provider configuration anchor connectivity checks', async () => {
    const { result, model } = await check([], '__provider_config__');
    expect(result.status).toBe('ready');
    expect(model.setEnabled).toHaveBeenCalledWith('binding', true);
  });
});
