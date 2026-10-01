// @vitest-environment node
import { createHash } from 'node:crypto';
import { link, mkdtemp, open, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { ScopedFileWriter } from './scopedFileWriter';

const cleanup: string[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'scoped-write-'));
  cleanup.push(root);
  const writer = await ScopedFileWriter.open(root);
  return { root, writer };
}

describe('Linux scoped file capability with real files', () => {
  it('writes durable bytes and verifies them after reopening the capability', async () => {
    const { root, writer } = await fixture();
    const target = path.join(root, 'result');
    const digest = createHash('sha256').update('结果').digest('hex');
    expect(await writer.write(target, '结果')).toBe(digest);
    await writer.close();
    const reopened = await ScopedFileWriter.open(root);
    try {
      expect(await reopened.digest(target)).toBe(digest);
    } finally {
      await reopened.close();
    }
  });

  it('rejects traversal, nested paths, symlink destinations and closed capabilities', async () => {
    const { root, writer } = await fixture();
    const outside = `${root}-outside`;
    cleanup.push(outside);
    await writeFile(outside, 'protected');
    await symlink(outside, path.join(root, 'link'));
    try {
      for (const target of [outside, `${root}/../outside`, `${root}/nested/file`, `${root}/link`]) {
        await expect(writer.write(target, 'attack')).rejects.toThrow();
      }
      expect(await readFile(outside, 'utf8')).toBe('protected');
    } finally {
      await writer.close();
    }
    await expect(writer.write(`${root}/result`, 'attack')).rejects.toThrow();
  });

  it('drains an admitted write before closing its pinned directory descriptor', async () => {
    const { root, writer } = await fixture();
    const sample = await open(path.join(root, 'sample'), 'w');
    const prototype = Object.getPrototypeOf(sample);
    const originalSync = prototype.sync;
    await sample.close();
    let release!: () => void;
    let reached!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const syncing = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const spy = vi.spyOn(prototype, 'sync').mockImplementationOnce(async function (
      this: typeof sample,
    ) {
      reached();
      await blocked;
      return originalSync.call(this);
    });
    const writing = writer.write(path.join(root, 'result'), 'durable');
    await syncing;
    let closed = false;
    const closing = writer.close().then(() => {
      closed = true;
    });
    try {
      await expect(writer.write(path.join(root, 'late'), 'denied')).rejects.toThrow('closed');
      expect(closed).toBe(false);
      release();
      await writing;
      await closing;
      expect(await readFile(path.join(root, 'result'), 'utf8')).toBe('durable');
    } finally {
      release();
      spy.mockRestore();
      await closing;
    }
  });

  it('concurrent capabilities replace complete files without interleaving bytes', async () => {
    const { root, writer } = await fixture();
    const other = await ScopedFileWriter.open(root);
    const target = path.join(root, 'concurrent');
    const values = ['a'.repeat(100000), 'b'.repeat(100000)];
    try {
      await Promise.all([writer.write(target, values[0]), other.write(target, values[1])]);
      expect(values).toContain(await readFile(target, 'utf8'));
    } finally {
      await Promise.all([writer.close(), other.close()]);
    }
  });

  it('replaces a hardlinked destination without changing the outside inode', async () => {
    const { root, writer } = await fixture();
    const outside = `${root}-outside`;
    cleanup.push(outside);
    await writeFile(outside, 'protected');
    await link(outside, path.join(root, 'linked'));
    try {
      await writer.write(path.join(root, 'linked'), 'new');
      expect(await readFile(outside, 'utf8')).toBe('protected');
      expect(await readFile(path.join(root, 'linked'), 'utf8')).toBe('new');
    } finally {
      await writer.close();
    }
  });
});
