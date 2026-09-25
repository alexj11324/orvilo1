import { describe, expect, it, vi } from 'vitest';

import { createDevRendererOriginResolver } from '../devRendererOrigin';

const DEFAULT_ORIGIN = 'http://127.0.0.1:5180';
const OVERRIDE_FILE = '/tmp/ud-7/dev-renderer-url';

const createFs = (files: Record<string, { content: string; mtimeMs: number }>) => ({
  readFileSync: vi.fn((file: string) => {
    const entry = files[file];
    if (!entry) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return entry.content;
  }),
  statSync: vi.fn((file: string) => {
    const entry = files[file];
    if (!entry) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return { mtimeMs: entry.mtimeMs };
  }),
});

describe('createDevRendererOriginResolver', () => {
  it('returns the default origin when no override file exists', () => {
    const fs = createFs({});
    const resolve = createDevRendererOriginResolver(DEFAULT_ORIGIN, OVERRIDE_FILE, fs);

    expect(resolve()).toBe(DEFAULT_ORIGIN);
  });

  it('returns the override origin without a trailing slash', () => {
    const fs = createFs({ [OVERRIDE_FILE]: { content: 'http://127.0.0.1:5312/\n', mtimeMs: 1 } });
    const resolve = createDevRendererOriginResolver(DEFAULT_ORIGIN, OVERRIDE_FILE, fs);

    expect(resolve()).toBe('http://127.0.0.1:5312');
  });

  it('only re-reads the file when its mtime changes', () => {
    const files = { [OVERRIDE_FILE]: { content: 'http://127.0.0.1:5312', mtimeMs: 1 } };
    const fs = createFs(files);
    const resolve = createDevRendererOriginResolver(DEFAULT_ORIGIN, OVERRIDE_FILE, fs);

    resolve();
    resolve();
    expect(fs.readFileSync).toHaveBeenCalledTimes(1);

    files[OVERRIDE_FILE] = { content: 'http://127.0.0.1:5400', mtimeMs: 2 };
    expect(resolve()).toBe('http://127.0.0.1:5400');
    expect(fs.readFileSync).toHaveBeenCalledTimes(2);
  });

  it('falls back to the default origin once the override file is removed', () => {
    const files: Record<string, { content: string; mtimeMs: number }> = {
      [OVERRIDE_FILE]: { content: 'http://127.0.0.1:5312', mtimeMs: 1 },
    };
    const fs = createFs(files);
    const resolve = createDevRendererOriginResolver(DEFAULT_ORIGIN, OVERRIDE_FILE, fs);

    expect(resolve()).toBe('http://127.0.0.1:5312');
    delete files[OVERRIDE_FILE];
    expect(resolve()).toBe(DEFAULT_ORIGIN);
  });

  it.each([['not a url'], ['file:///etc/passwd'], ['https://example.com'], ['']])(
    'ignores an override that is not a loopback http origin: %s',
    (content) => {
      const fs = createFs({ [OVERRIDE_FILE]: { content, mtimeMs: 1 } });
      const onInvalid = vi.fn();
      const resolve = createDevRendererOriginResolver(DEFAULT_ORIGIN, OVERRIDE_FILE, fs, onInvalid);

      expect(resolve()).toBe(DEFAULT_ORIGIN);
      if (content) expect(onInvalid).toHaveBeenCalledWith(content);
    },
  );
});
