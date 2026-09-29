import { access, copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

import type { Plugin } from 'vite';

export const cfReactRouterManifestBridge = (appRoot: string): Plugin => ({
  applyToEnvironment: (environment) => environment.name === 'client',
  enforce: 'post',
  name: 'cf-react-router-manifest-bridge',
  async writeBundle({ dir }) {
    if (!dir?.includes(path.join('.cloudflare', 'output'))) return;

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
