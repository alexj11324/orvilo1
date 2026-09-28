import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { OrviloDatabase } from '@/database/type';
import type { FileService } from '@/server/services/file';
import type { MarketService } from '@/server/services/market';

import { SandboxMiddlewareService } from '../service';
import type { SandboxProvider, SandboxProviderKind } from '../types';

const findFilesToInitInSandbox = vi.fn();

vi.mock('@/database/models/file', () => ({
  FileModel: vi.fn().mockImplementation(function () {
    return { findFilesToInitInSandbox };
  }),
}));

/**
 * A fake cloud machine standing in for a future sandbox provider. It conforms
 * to the {@link SandboxProvider} interface alone — `callTool` for
 * provision/exec verbs and `exportFileToUploadUrl` for artifact handoff — and
 * is never registered in the factory, so production cannot select it.
 */
const createFakeCloudProvider = (
  overrides: Partial<SandboxProvider> = {},
): SandboxProvider & { calls: { params: Record<string, unknown>; toolName: string }[] } => {
  const calls: { params: Record<string, unknown>; toolName: string }[] = [];
  return {
    calls,
    capabilities: {
      backgroundCommands: true,
      exportFile: true,
      files: true,
      languages: ['python', 'typescript'],
      persistentSession: true,
      shell: true,
      skillScripts: true,
    },
    callTool: vi.fn(async (toolName: string, params: Record<string, unknown>) => {
      calls.push({ params, toolName });
      return { result: { exitCode: 0, stdout: 'ok' }, success: true };
    }),
    exportFileToUploadUrl: vi.fn(async () => ({
      result: { mime_type: 'text/plain' },
      success: true,
    })),
    // Not a registered SandboxProviderKind — a future provider registers its
    // own kind in the union + factory branch; the middleware only forwards it.
    kind: 'fake-cloud' as SandboxProviderKind,
    ...overrides,
  };
};

const createFileService = (): FileService =>
  ({
    createCachedPreSignedUrlForPreview: vi.fn(async () => 'https://download.example.com/x'),
    createFileRecord: vi.fn(async () => ({ fileId: 'file-1', url: '/f/file-1' })),
    createPreSignedUpload: vi.fn(async () => ({
      headers: { 'x-amz-acl': 'public-read' },
      url: 'https://uploads.example.com/put',
    })),
    getFileMetadata: vi.fn(async () => ({ contentLength: 7, contentType: 'text/plain' })),
  }) as unknown as FileService;

const baseOptions = () => ({
  fileService: createFileService(),
  marketService: {} as MarketService,
  serverDB: {} as OrviloDatabase,
  topicId: 'topic-1',
  userId: 'user-1',
});

describe('sandbox provider extension contract', () => {
  beforeEach(() => {
    findFilesToInitInSandbox.mockReset();
    findFilesToInitInSandbox.mockResolvedValue([]);
  });

  it('provisions files and executes commands through the provider interface alone', async () => {
    findFilesToInitInSandbox.mockResolvedValue([
      { fileType: 'text/csv', id: 'f1', name: 'data.csv', size: 10, url: 'key-1' },
    ]);
    const provider = createFakeCloudProvider();
    const service = new SandboxMiddlewareService(provider, baseOptions());

    await service.callTool('runCommand', { command: 'python main.py' });
    // Second call must not re-provision — the in-sandbox marker owns idempotency.
    await service.callTool('runCommand', { command: 'echo done' });

    expect(provider.calls[0].toolName).toBe('runCommand');
    expect(provider.calls[0].params.command).toContain('curl');
    expect(provider.calls[1].params.command).toBe('python main.py');
    expect(provider.calls).toHaveLength(3);
  });

  it('hands off artifacts through the shared upload-URL flow', async () => {
    const provider = createFakeCloudProvider();
    const fileService = createFileService();
    const service = new SandboxMiddlewareService(provider, {
      ...baseOptions(),
      fileService,
    });

    const result = await service.exportAndUploadFile('/workspace/out.txt', 'out.txt');

    expect(result.success).toBe(true);
    expect(provider.exportFileToUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ filename: 'out.txt', path: '/workspace/out.txt' }),
    );
    expect(fileService.createFileRecord).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'out.txt' }),
    );
  });

  it('skips file provisioning when the provider lacks the shell capability', async () => {
    findFilesToInitInSandbox.mockResolvedValue([
      { fileType: 'text/csv', id: 'f1', name: 'data.csv', size: 10, url: 'key-1' },
    ]);
    const provider = createFakeCloudProvider({
      capabilities: {
        backgroundCommands: false,
        exportFile: true,
        files: true,
        languages: [],
        persistentSession: false,
        shell: false,
        skillScripts: false,
      },
    });
    const service = new SandboxMiddlewareService(provider, baseOptions());

    await service.callTool('listFiles', { directoryPath: '/mnt/data' });

    expect(provider.calls).toEqual([
      { params: { directoryPath: '/mnt/data' }, toolName: 'listFiles' },
    ]);
  });

  it('keeps the provider-kind union closed — unregistered kinds stay unselectable', () => {
    // `SANDBOX_PROVIDER` is a zod enum over this exact union, so env selection
    // cannot resolve an unimplemented provider kind. The type-level assertion
    // fails to compile if the union grows without a registered provider.
    const registered: Record<SandboxProviderKind, true> = { market: true, onlyboxes: true };
    expect(Object.keys(registered).sort()).toEqual(['market', 'onlyboxes']);
  });
});
