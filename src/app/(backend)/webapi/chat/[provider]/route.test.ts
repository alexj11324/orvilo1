// @vitest-environment node
import { REQUEST_TOPIC_ID_HEADER } from '@orvilo/const';
import { type OrviloRuntimeAI } from '@orvilo/model-runtime';
import { ModelRuntime } from '@orvilo/model-runtime';
import { ChatErrorType } from '@orvilo/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { initModelRuntimeFromDB } from '@/server/modules/ModelRuntime';

import { POST } from './route';

vi.mock('@/server/modules/ModelRuntime', () => ({
  initModelRuntimeFromDB: vi.fn(),
  createTraceOptions: vi.fn().mockReturnValue({}),
}));

const mocks = vi.hoisted(() => ({ userId: 'test-user-id' as null | string }));

vi.mock('@/app/(backend)/middleware/auth', () => ({
  checkAuth:
    (handler: (req: Request, context: { serverDB: object; userId: string }) => Promise<Response>) =>
    async (req: Request, options: unknown) => {
      if (!mocks.userId) {
        const { createErrorResponse } = await import('@/utils/errorResponse');
        return createErrorResponse(ChatErrorType.Unauthorized);
      }
      return handler(req, { ...(options as object), serverDB: {}, userId: mocks.userId });
    },
}));

// 模拟请求和响应
let request: Request;
beforeEach(() => {
  request = new Request(new URL('https://test.com'), {
    method: 'POST',
    body: JSON.stringify({ model: 'test-model' }),
  });

  // Default: valid session
  mocks.userId = 'test-user-id';
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('POST handler', () => {
  describe('init chat model', () => {
    it('should initialize ModelRuntime correctly with valid session', async () => {
      const mockParams = Promise.resolve({ provider: 'test-provider' });

      const mockChatResponse = new Response(JSON.stringify({ success: true }), {
        headers: { 'Content-Type': 'application/json' },
      });
      const mockRuntime: OrviloRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn().mockResolvedValue(mockChatResponse),
      };

      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      await POST(request as unknown as Request, { params: mockParams });

      expect(initModelRuntimeFromDB).toHaveBeenCalledWith(
        expect.anything(),
        'test-user-id',
        'test-provider',
        undefined,
      );
    });

    it('should return Unauthorized error when no session exists', async () => {
      mocks.userId = null;

      const mockParams = Promise.resolve({ provider: 'test-provider' });

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(401);
    });
  });

  describe('chat', () => {
    it.each([undefined, 'topic-123'])(
      'should pass topic %s to chat runtime metadata',
      async (topicId) => {
        const mockParams = Promise.resolve({ provider: 'test-provider' });
        const mockChatPayload = { message: 'Hello, world!' };
        request = new Request(new URL('https://test.com'), {
          method: 'POST',
          headers: topicId ? { [REQUEST_TOPIC_ID_HEADER]: topicId } : {},
          body: JSON.stringify(mockChatPayload),
        });

        const mockChatResponse: any = { success: true, message: 'Reply from agent' };
        const mockRuntime: OrviloRuntimeAI = {
          baseURL: 'abc',
          chat: vi.fn().mockResolvedValue(mockChatResponse),
        };

        vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

        const response = await POST(request as unknown as Request, { params: mockParams });

        expect(response).toEqual(mockChatResponse);
        expect(mockRuntime.chat).toHaveBeenCalledWith(mockChatPayload, {
          metadata: { topicId },
          user: 'test-user-id',
          signal: expect.anything(),
        });
      },
    );

    it('should return an error response when chat completion fails', async () => {
      const mockParams = Promise.resolve({ provider: 'test-provider' });
      const mockChatPayload = { message: 'Hello, world!' };
      request = new Request(new URL('https://test.com'), {
        method: 'POST',
        body: JSON.stringify(mockChatPayload),
      });

      const mockErrorResponse = {
        errorType: ChatErrorType.InternalServerError,
        error: { errorMessage: 'Something went wrong', errorType: 500 },
        errorMessage: 'Something went wrong',
      };

      const mockRuntime: OrviloRuntimeAI = {
        baseURL: 'abc',
        chat: vi.fn().mockRejectedValue(mockErrorResponse),
      };

      vi.mocked(initModelRuntimeFromDB).mockResolvedValue(new ModelRuntime(mockRuntime));

      const response = await POST(request, { params: mockParams });

      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        body: {
          errorMessage: 'Something went wrong',
          error: {
            errorMessage: 'Something went wrong',
            errorType: 500,
          },
          provider: 'test-provider',
        },
        errorType: 500,
      });
    });
  });
});
