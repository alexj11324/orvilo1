import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import path from 'node:path';

/** A trusted broker creates one capability per admitted workspace. The directory
 * must be broker-owned and unavailable to the runtime for rename or replacement.
 * This is a file capability, not OS isolation or grant authorization. */
export class ScopedFileWriter {
  private closed = false;
  private pending: Promise<unknown> = Promise.resolve();
  private closing?: Promise<void>;

  private constructor(
    private readonly root: string,
    private readonly directory: FileHandle,
  ) {}

  static async open(root: string) {
    if (process.platform !== 'linux' || !path.isAbsolute(root) || (await realpath(root)) !== root) {
      throw new Error('A canonical Linux broker directory is required');
    }
    const directory = await open(
      root,
      constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW,
    );
    return new ScopedFileWriter(root, directory);
  }

  private target(target: string) {
    if (
      path.dirname(target) !== this.root ||
      target !== path.join(this.root, path.basename(target)) ||
      !path.basename(target) ||
      ['.', '..'].includes(path.basename(target))
    ) {
      throw new Error('File target is outside the capability');
    }
    // Pin traversal to an open directory descriptor. No caller-controlled parent
    // component is traversed; nested paths require a separately admitted capability.
    return `/proc/self/fd/${this.directory.fd}/${path.basename(target)}`;
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closed) return Promise.reject(new Error('File capability is closed'));
    const result = this.pending.then(operation);
    this.pending = result.catch(() => undefined);
    return result;
  }

  authorize(target: string) {
    return this.run(() => this.authorizeTarget(target));
  }

  private async authorizeTarget(target: string) {
    const destination = this.target(target);
    try {
      if (!(await lstat(destination)).isFile()) throw new Error('File target must be regular');
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
  }

  write(target: string, content: string) {
    return this.run(() => this.replace(target, content));
  }

  private async replace(target: string, content: string) {
    await this.authorizeTarget(target);
    const destination = this.target(target);
    const temporary = `/proc/self/fd/${this.directory.fd}/.action-${randomUUID()}`;
    const handle = await open(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    let replaced = false;
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
      await handle.close();
      // Replace the directory entry instead of truncating the old inode, so even
      // a hard link cannot cause a write to an inode outside this capability.
      await rename(temporary, destination);
      replaced = true;
      await this.directory.sync();
    } finally {
      await handle.close();
      if (!replaced) await unlink(temporary);
    }
    // The receipt identifies the bytes committed by this operation. A separate
    // digest verifies current content; authority admission must serialize other
    // capabilities addressing the same workspace until postcondition checking.
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  digest(target: string) {
    return this.run(() => this.readDigest(target));
  }

  private async readDigest(target: string) {
    const handle = await open(
      this.target(target),
      constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
    );
    try {
      if (!(await handle.stat()).isFile()) throw new Error('File target must be regular');
      return createHash('sha256')
        .update(await handle.readFile())
        .digest('hex');
    } finally {
      await handle.close();
    }
  }

  close(): Promise<void> {
    if (!this.closing) {
      this.closed = true;
      this.closing = this.pending.then(() => this.directory.close());
    }
    return this.closing;
  }
}
