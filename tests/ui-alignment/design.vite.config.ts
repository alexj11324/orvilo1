import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const repository = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  cacheDir: process.env.UI_ALIGNMENT_CACHE_DIR ?? repository + '/node_modules/.vite-ui-alignment',
  css: { postcss: repository },
  define: { __ELECTRON__: true },
  plugins: [react()],

  resolve: {
    tsconfigPaths: true,
    alias: [
      {
        find: /^@orvilo\/heterogeneous-agents$/,
        replacement: repository + '/packages/heterogeneous-agents/src/config.ts',
      },
      {
        find: /^.*useTaskCopyActions$/,
        replacement: repository + '/tests/ui-alignment/designData.ts',
      },
      { find: /^@\/store\/tool$/, replacement: repository + '/tests/ui-alignment/designData.ts' },
      { find: /^@orvilo\/types$/, replacement: repository + '/tests/ui-alignment/designTypes.ts' },
      {
        find: /^.*useAgentDisplayMeta$/,
        replacement: repository + '/tests/ui-alignment/designData.ts',
      },
      {
        find: /^@\/store\/task\/selectors$/,
        replacement: repository + '/src/store/task/selectors/listSelectors.ts',
      },
      {
        find: /^@\/business\/client\/hooks\/useActiveWorkspaceId$/,
        replacement: repository + '/tests/ui-alignment/designData.ts',
      },
      {
        find: /^@\/features\/Teammates\/api\/hooks$/,
        replacement: repository + '/tests/ui-alignment/designData.ts',
      },
      {
        find: /^@\/hooks\/useFetchAgentList$/,
        replacement: repository + '/tests/ui-alignment/designData.ts',
      },
      { find: /^@\/libs\/swr$/, replacement: repository + '/tests/ui-alignment/designData.ts' },
      {
        find: /^@\/libs\/swr\/keys$/,
        replacement: repository + '/tests/ui-alignment/designData.ts',
      },
      { find: /^@\/store\/home$/, replacement: repository + '/tests/ui-alignment/designData.ts' },
      { find: /^@\/store\/user$/, replacement: repository + '/tests/ui-alignment/designData.ts' },
      {
        find: /^@\/store\/home\/selectors$/,
        replacement: repository + '/tests/ui-alignment/designData.ts',
      },
      {
        find: /^@\/store\/user\/selectors$/,
        replacement: repository + '/tests/ui-alignment/designData.ts',
      },
      {
        find: /^@\/services\/taskLabel$/,
        replacement: repository + '/tests/ui-alignment/designData.ts',
      },
    ],
  },
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: { host: '127.0.0.1', port: 5190, strictPort: true },
});
