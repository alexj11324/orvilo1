import { rm as fsRm, writeFile as fsWriteFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { log } from '../utils/logger';
import { registerGenerateCommand } from './generate';

const { mockTrpcClient } = vi.hoisted(() => ({
  mockTrpcClient: {
    asr: {
      transcribe: { mutate: vi.fn() },
    },
  },
}));

const { getTrpcClient: mockGetTrpcClient } = vi.hoisted(() => ({
  getTrpcClient: vi.fn(),
}));

const { getAuthInfo: mockGetAuthInfo } = vi.hoisted(() => ({
  getAuthInfo: vi.fn(),
}));

const { writeFileSync: mockWriteFileSync } = vi.hoisted(() => ({
  writeFileSync: vi.fn(),
}));

const { uploadLocalFile: mockUploadLocalFile } = vi.hoisted(() => ({
  uploadLocalFile: vi.fn(),
}));

vi.mock('../utils/uploadLocalFile', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, uploadLocalFile: mockUploadLocalFile };
});

vi.mock('../api/client', () => ({ getTrpcClient: mockGetTrpcClient }));
vi.mock('../api/http', () => ({ getAuthInfo: mockGetAuthInfo }));
vi.mock('node:fs', async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, writeFileSync: mockWriteFileSync };
});
describe('generate command', () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let stdoutSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as any);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    mockGetTrpcClient.mockResolvedValue(mockTrpcClient);
    mockGetAuthInfo.mockResolvedValue({
      accessToken: 'test-token',
      headers: {
        'Content-Type': 'application/json',
        'Oidc-Auth': 'test-token',
      },
      serverUrl: 'https://orvilo.aspectlylabs.com',
    });
    for (const router of Object.values(mockTrpcClient)) {
      for (const method of Object.values(router)) {
        for (const fn of Object.values(method)) {
          (fn as ReturnType<typeof vi.fn>).mockReset();
        }
      }
    }
  });

  afterEach(() => {
    exitSpy.mockRestore();
    consoleSpy.mockRestore();
    stdoutSpy.mockRestore();
    vi.restoreAllMocks();
  });

  function createProgram() {
    const program = new Command();
    program.exitOverride();
    registerGenerateCommand(program);
    return program;
  }

  describe('tts', () => {
    it('should call OpenAI TTS endpoint and save file', async () => {
      const audioBuffer = new ArrayBuffer(100);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(audioBuffer),
          ok: true,
        }),
      );

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'generate',
        'tts',
        'Hello world',
        '--output',
        '/tmp/test.mp3',
      ]);

      expect(fetch).toHaveBeenCalledWith(
        'https://orvilo.aspectlylabs.com/webapi/tts/openai',
        expect.objectContaining({ method: 'POST' }),
      );
      expect(mockWriteFileSync).toHaveBeenCalledWith('/tmp/test.mp3', expect.any(Buffer));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('Audio saved'));
    });
  });

  describe('asr', () => {
    it('should exit when file not found', async () => {
      const program = createProgram();
      await program.parseAsync(['node', 'test', 'generate', 'asr', '/nonexistent/audio.mp3']);

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('not found'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should upload large local audio and transcribe by fileId', async () => {
      // Real >3MB temp file so existsSync/statSync (unmocked) see it as large.
      const bigPath = path.join(os.tmpdir(), `lh-asr-test-${process.pid}-${Date.now()}.mp3`);
      await fsWriteFile(bigPath, Buffer.alloc(4 * 1024 * 1024));
      mockUploadLocalFile.mockResolvedValue({ id: 'file_999' });
      mockTrpcClient.asr.transcribe.mutate.mockResolvedValue({ text: 'big result' });

      try {
        const program = createProgram();
        await program.parseAsync(['node', 'test', 'generate', 'asr', bigPath]);

        expect(mockUploadLocalFile).toHaveBeenCalledWith(expect.anything(), bigPath);
        expect(mockTrpcClient.asr.transcribe.mutate).toHaveBeenCalledWith(
          expect.objectContaining({ fileId: 'file_999', model: 'whisper-1', provider: 'openai' }),
        );
        // never inlines bytes for the large file
        expect(mockTrpcClient.asr.transcribe.mutate.mock.calls[0][0]).not.toHaveProperty(
          'audioBase64',
        );
        expect(stdoutSpy).toHaveBeenCalledWith('big result');
      } finally {
        await fsRm(bigPath, { force: true });
      }
    });

    it('should download and transcribe an audio URL', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('audio-bytes').buffer),
        headers: new Headers(),
        ok: true,
      });
      vi.stubGlobal('fetch', fetchMock);
      mockTrpcClient.asr.transcribe.mutate.mockResolvedValue({ text: 'hello world' });

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'generate',
        'asr',
        'https://example.com/audio/sample.mp3',
      ]);

      expect(fetchMock).toHaveBeenCalledWith('https://example.com/audio/sample.mp3');
      expect(mockTrpcClient.asr.transcribe.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          audioBase64: Buffer.from('audio-bytes').toString('base64'),
          fileName: 'sample.mp3',
          model: 'whisper-1',
          provider: 'openai',
        }),
      );
      expect(stdoutSpy).toHaveBeenCalledWith('hello world');
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('should derive an extension and mime type from Content-Type when the URL has none', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('audio-bytes').buffer),
          headers: new Headers({ 'content-type': 'audio/mpeg; charset=binary' }),
          ok: true,
        }),
      );
      mockTrpcClient.asr.transcribe.mutate.mockResolvedValue({ text: 'ok' });

      const program = createProgram();
      await program.parseAsync(['node', 'test', 'generate', 'asr', 'https://example.com/download']);

      expect(mockTrpcClient.asr.transcribe.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          fileName: 'download.mp3',
          mimeType: 'audio/mpeg',
        }),
      );
    });

    it('should prefer the filename from Content-Disposition', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode('audio-bytes').buffer),
          headers: new Headers({
            'content-disposition': 'attachment; filename="recording.wav"',
          }),
          ok: true,
        }),
      );
      mockTrpcClient.asr.transcribe.mutate.mockResolvedValue({ text: 'ok' });

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'generate',
        'asr',
        'https://example.com/files/abc123?sig=xyz',
      ]);

      expect(mockTrpcClient.asr.transcribe.mutate).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: 'recording.wav' }),
      );
    });

    it('should exit when audio URL download fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' }),
      );

      const program = createProgram();
      await program.parseAsync([
        'node',
        'test',
        'generate',
        'asr',
        'https://example.com/missing.mp3',
      ]);

      expect(log.error).toHaveBeenCalledWith(expect.stringContaining('Failed to download audio'));
      expect(exitSpy).toHaveBeenCalledWith(1);
    });
  });
});
