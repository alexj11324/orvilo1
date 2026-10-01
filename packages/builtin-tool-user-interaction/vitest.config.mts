import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const packageDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(packageDir, '../..');

export default defineConfig({
  plugins: [
    {
      enforce: 'pre',
      name: 'stub-emoji-mart',
      resolveId(id) {
        if (id === '@emoji-mart/data' || id.startsWith('@emoji-mart/data/'))
          return path.resolve(repoRoot, 'tests/mocks/emojiMartData.mjs');
        if (id === '@emoji-mart/react')
          return path.resolve(repoRoot, 'tests/mocks/emojiMartReact.mjs');
        return null;
      },
    },
  ],
  // Resolve the root `paths` map (packages first, app src as fallback) so
  // shared-tool-ui's `@/components/...` imports load correctly in tests.
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: 'node',
    server: {
      deps: {
        inline: [/@lobehub\//, /@emoji-mart\//],
      },
    },
  },
});
