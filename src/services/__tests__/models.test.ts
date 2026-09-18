import type * as FetchSSE from '@orvilo/fetch-sse';
import { getMessageError } from '@orvilo/fetch-sse';
import { type Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createHeaderWithAuth } from '../_auth';
import { ModelsService } from '../models';

vi.stubGlobal('fetch', vi.fn());

vi.mock('@orvilo/fetch-sse', async () => {
  const actual = (await vi.importActual('@orvilo/fetch-sse')) as typeof FetchSSE;

  return {
    ...actual,
    getMessageError: vi.fn(actual.getMessageError),
  };
});

vi.mock('@/const/version', () => ({
  isDesktop: false,
}));

vi.mock('../_auth', () => ({
  createHeaderWithAuth: vi.fn(async () => ({})),
}));

// 创建一个测试用的 ModelsService 实例
const modelsService = new ModelsService();

const mockedCreateHeaderWithAuth = vi.mocked(createHeaderWithAuth);
const mockedGetMessageError = vi.mocked(getMessageError);

describe('ModelsService', () => {
  beforeEach(() => {
    (fetch as Mock).mockClear();
    mockedCreateHeaderWithAuth.mockClear();
    mockedGetMessageError.mockClear();
  });

  describe('getModels', () => {
    it('should call the provider endpoint', async () => {
      (fetch as Mock).mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), { status: 200 }),
      );

      await modelsService.getModels('openai');

      expect(fetch).toHaveBeenCalledWith('/webapi/models/openai', { headers: {} });
    });

    it('should use the original provider id for custom provider endpoints', async () => {
      (fetch as Mock).mockResolvedValueOnce(
        new Response(JSON.stringify({ models: [] }), { status: 200 }),
      );

      await modelsService.getModels('custom-provider');

      // API endpoint uses original provider, allowing server to query correct config
      expect(fetch).toHaveBeenCalledWith('/webapi/models/custom-provider', { headers: {} });
    });

    it('should throw model fetch error details when server response is not ok', async () => {
      (fetch as Mock).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body: {
              error: {
                message: 'Cloudflare models API returned an invalid response',
                name: 'Error',
              },
              message: 'Cloudflare models API returned an invalid response',
              provider: 'cloudflare',
            },
            errorType: 'ProviderBizError',
          }),
          { status: 471 },
        ),
      );

      await expect(modelsService.getModels('cloudflare')).rejects.toThrow(
        'Cloudflare models API returned an invalid response',
      );
    });

    it('should fall back to translated error message when server error body has no message', async () => {
      mockedGetMessageError.mockResolvedValueOnce({
        body: {
          provider: 'cloudflare',
        },
        message: 'fallback model fetch failure',
        type: 'ProviderBizError',
      });
      (fetch as Mock).mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            body: {
              provider: 'cloudflare',
            },
            errorType: 'ProviderBizError',
          }),
          { status: 471 },
        ),
      );

      await expect(modelsService.getModels('cloudflare')).rejects.toThrow(
        'fallback model fetch failure',
      );
    });

    it('should propagate server fetch network errors', async () => {
      (fetch as Mock).mockRejectedValueOnce(new Error('network down'));

      await expect(modelsService.getModels('openai')).rejects.toThrow('network down');
    });
  });
});
