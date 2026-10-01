import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // The vendored pi-ai package only resolves through the esbuild bundle —
      // tests use a queue-backed AssistantMessageEventStream stub instead.
      '@earendil-works/pi-ai': path.resolve(__dirname, 'test/piAiStreamStub.ts'),
    },
  },
  test: {
    environment: 'node',
  },
});
