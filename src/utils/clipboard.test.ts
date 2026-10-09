import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyToClipboard } from './clipboard';

const stubFallbackDocument = (execCommand: () => boolean) =>
  vi.stubGlobal('document', {
    body: { append: vi.fn() },
    createElement: () => ({ focus: vi.fn(), remove: vi.fn(), select: vi.fn(), value: '' }),
    execCommand,
  });

describe('copyToClipboard', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('resolves true when the async clipboard accepts the text', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    await expect(copyToClipboard('secret')).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('secret');
  });

  it('falls back to execCommand and reports its result', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    const execCommand = vi.fn().mockReturnValue(true);
    stubFallbackDocument(execCommand);

    await expect(copyToClipboard('secret')).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith('copy');
  });

  it('resolves false when both paths fail instead of throwing', async () => {
    vi.stubGlobal('navigator', {
      clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
    });
    stubFallbackDocument(() => {
      throw new Error('unsupported');
    });

    await expect(copyToClipboard('secret')).resolves.toBe(false);
  });
});
