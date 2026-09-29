import { access, copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

import type { Plugin } from 'vite';

export const cfReactRouterManifestBridge = (appRoot: string): Plugin => ({
  enforce: 'post',
  name: 'cf-react-router-manifest-bridge',
  async writeBundle({ dir }) {
    if (!dir?.includes(path.join('.cloudflare', 'output'))) return;

    if (this.environment.name !== 'client') {
      const source = path.join(appRoot, 'build', 'client', 'assets');
      const target = path.resolve(dir, '../assets/assets');
      await mkdir(target, { recursive: true });
      for (const file of await readdir(source)) {
        if (/^manifest-[a-f0-9]{8}\.js$/.test(file)) {
          await copyFile(path.join(source, file), path.join(target, file));
        }
      }
      return;
    }

    const manifest = path.join(dir, '.vite', 'manifest.json');
    try {
      await access(manifest);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }

    const target = path.join(appRoot, 'build', 'client', '.vite', 'manifest.json');
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(manifest, target);
  },
});
